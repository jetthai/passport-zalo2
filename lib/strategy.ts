import base64url from 'base64url';
import crypto from 'crypto';
import { Request } from 'express';
import https from 'https';
import OAuth2Strategy, {
	StrategyOptions as PassportOAuth2StrategyOptions,
	StrategyOptionsWithRequest as PassportOAuth2StrategyOptionsWithRequest,
	VerifyCallback,
} from 'passport-oauth2';
import url from 'url';

import { mapUserProfile } from './mapUserProfile';
import { ProfileWithMetaData, ZaloTokenError } from './models';
import {
	AuthenticateOptions,
	isStrategyOptions,
	isStrategyOptionsWithRequest,
	PKCEStore,
	StrategyOptions,
	StrategyOptionsWithRequest,
} from './models';
import { ZaloUserInfoResponse } from './models';

/**
 * Verify callback for Zalo strategy (alias for passport-oauth2 VerifyCallback)
 */
export type ZaloVerifyCallback = VerifyCallback;

/**
 * Verify function without request
 */
export type ZaloVerifyFunction = (
	accessToken: string,
	refreshToken: string,
	profile: ProfileWithMetaData,
	verified: VerifyCallback,
) => void;

/**
 * Verify function with request
 */
export type ZaloVerifyFunctionWithRequest = (
	req: Request,
	accessToken: string,
	refreshToken: string,
	profile: ProfileWithMetaData,
	verified: VerifyCallback,
) => void;

/**
 * @public
 */
export class Strategy extends OAuth2Strategy {
	_userProfileURL: string;
	_useRealPKCE: boolean;
	_appId: string;
	_appSecret: string;
	_zaloCallbackURL: string;
	_zaloVerify: ZaloVerifyFunction | ZaloVerifyFunctionWithRequest;
	_passReqToCallback: boolean;
	// These properties exist on passport-oauth2 Strategy but are not typed
	declare _stateStore: PKCEStore;
	declare _callbackURL: string;
	declare _scope: string | string[];

	/**
	 * Zalo strategy constructor
	 *
	 * Required options:
	 *
	 *   - `appId` - your Zalo application's App ID
	 *   - `appSecret` - your Zalo application's App Secret
	 *   - `callbackURL` - URL to which Zalo will redirect the user after granting authorization
	 *
	 * @remarks
	 * The Zalo authentication strategy authenticates requests by delegating to
	 * Zalo using the OAuth 2.0 protocol with PKCE.
	 *
	 * Applications must supply a `verify` callback which accepts an `accessToken`,
	 * `refreshToken` and service-specific `profile`, and then calls the `cb`
	 * callback supplying a `user`, which should be set to `false` if the
	 * credentials are not valid. If an exception occurred, `err` should be set.
	 *
	 * @example
	 * ```
	 * passport.use(new ZaloStrategy({
	 *     appId: 'your-app-id',
	 *     appSecret: 'your-app-secret',
	 *     callbackURL: 'https://www.example.net/auth/zalo/callback'
	 *   },
	 *   function(accessToken, refreshToken, profile, cb) {
	 *     User.findOrCreate(..., function (err, user) {
	 *       cb(err, user);
	 *     });
	 *   }
	 * ));
	 * ```
	 */
	constructor(userOptions: StrategyOptions, verify: ZaloVerifyFunction);
	constructor(userOptions: StrategyOptionsWithRequest, verify: ZaloVerifyFunctionWithRequest);
	constructor(
		userOptions: StrategyOptions | StrategyOptionsWithRequest,
		verify: ZaloVerifyFunction | ZaloVerifyFunctionWithRequest,
	) {
		const options = Strategy.buildStrategyOptions(userOptions);

		// Create a dummy verify function for passport-oauth2
		// We handle the actual verification ourselves
		const dummyVerify = (
			accessToken: string,
			refreshToken: string,
			profile: ProfileWithMetaData,
			done: ZaloVerifyCallback,
		) => {
			done(null, profile);
		};

		// Cast to passport-oauth2 types to allow custom PKCEStore
		if (isStrategyOptions(options)) {
			super(options as unknown as PassportOAuth2StrategyOptions, dummyVerify as never);
		} else if (isStrategyOptionsWithRequest(options)) {
			super(options as unknown as PassportOAuth2StrategyOptionsWithRequest, dummyVerify as never);
		} else {
			throw Error('Strategy options not supported.');
		}

		this.name = 'zalo';
		this._appId = userOptions.appId;
		this._appSecret = userOptions.appSecret;
		this._zaloCallbackURL = userOptions.callbackURL;
		this._zaloVerify = verify;
		this._passReqToCallback = !!userOptions.passReqToCallback;
		this._userProfileURL =
			options.userProfileURL || 'https://graph.zalo.me/v2.0/me?fields=id,birthday,name,gender,picture';

		// Track if real PKCE is being used (custom store provided)
		this._useRealPKCE = !!userOptions.store;
	}

	static buildStrategyOptions(userOptions: StrategyOptions | StrategyOptionsWithRequest) {
		const options = (userOptions || {}) as StrategyOptions | StrategyOptionsWithRequest;
		options.sessionKey = options.sessionKey || 'oauth:zalo';
		const authorizationURL = options.authorizationURL || 'https://oauth.zaloapp.com/v4/permission';
		const tokenURL = options.tokenURL || 'https://oauth.zaloapp.com/v4/access_token';

		// Zalo requires clients to use PKCE (RFC 7636)
		// If a custom store is provided, use real PKCE
		// Otherwise, we'll handle PKCE manually in authenticate()
		if (!options.store) {
			type StoreCb = (err: Error | null, state?: string) => void;
			type VerifyCb = (err: Error | null, ok?: string | false, state?: string) => void;

			options.store = {
				store: (_req: unknown, _verifier: string, _state: unknown, _meta: unknown, cb: StoreCb) => {
					cb(null, 'state');
				},
				verify: (_req: unknown, _state: string, cb: VerifyCb) => {
					cb(null, 'challenge', 'state');
				},
			};
		}

		options.pkce = true;
		options.state = true;

		// Map appId/appSecret to clientID/clientSecret for passport-oauth2
		return {
			...options,
			clientID: userOptions.appId,
			clientSecret: userOptions.appSecret,
			authorizationURL,
			tokenURL,
		};
	}

	/**
	 * Retrieve user profile from Zalo.
	 *
	 * @remarks
	 * This function fetches Zalo user info and maps it to normalized profile,
	 * with the following properties parsed from Zalo user info response:
	 *
	 *   - `id`
	 *   - `name`
	 *   - `birthday`
	 *   - `gender`
	 *   - `picture`
	 */
	userProfile(accessToken: string, done: (error: Error | null, user?: ProfileWithMetaData) => void) {
		const profileUrl = new URL(this._userProfileURL);

		const requestOptions = {
			hostname: profileUrl.hostname,
			path: profileUrl.pathname + profileUrl.search,
			method: 'GET',
			headers: {
				access_token: accessToken,
			},
		};

		const req = https.request(requestOptions, (res) => {
			let data = '';
			res.on('data', (chunk) => (data += chunk.toString()));
			res.on('end', () => {
				try {
					const zaloUserInfoResponse = JSON.parse(data) as unknown as ZaloUserInfoResponse;

					if (zaloUserInfoResponse.error) {
						return done(new Error(zaloUserInfoResponse.message || 'Failed to fetch user profile'));
					}

					const userProfile = mapUserProfile(zaloUserInfoResponse);

					const userProfileWithMetadata: ProfileWithMetaData = {
						...userProfile,
						_raw: data,
						_json: zaloUserInfoResponse,
					};

					done(null, userProfileWithMetadata);
				} catch {
					done(new Error('Failed to parse user profile'));
				}
			});
		});

		req.on('error', (error) => done(new OAuth2Strategy.InternalOAuthError('Failed to fetch user profile', error)));
		req.end();
	}

	/**
	 * Return extra parameters to be included in the authorization request.
	 * When using real PKCE (custom store), we return empty and let authenticate() handle it.
	 * When using fake PKCE (no custom store), returns a fixed code_challenge.
	 */
	authorizationParams(): object {
		if (this._useRealPKCE) {
			return {};
		}
		// Fake PKCE bypass with fixed challenge (S256)
		const verifier = 'challenge';
		const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
		return {
			app_id: this._appId,
			code_challenge: challenge,
			code_challenge_method: 'S256',
		};
	}

	/**
	 * Return extra parameters to be included in the token request.
	 * Note: Zalo uses custom token endpoint handling, so this may not be used directly.
	 */
	tokenParams(): object {
		if (this._useRealPKCE) {
			return {};
		}
		return {
			code_verifier: 'challenge',
		};
	}

	/**
	 * Authenticate request with custom PKCE handling for Zalo.
	 *
	 * Zalo's OAuth flow requires:
	 * 1. app_id instead of client_id in authorization URL
	 * 2. secret_key header instead of client_secret in token request
	 * 3. PKCE with S256 method
	 */
	authenticate(req: Request, options?: AuthenticateOptions): void {
		options = options || {};

		const query = req.query as Record<string, unknown>;
		const body = req.body as Record<string, unknown>;
		const hasCode = query?.code || body?.code;

		if (hasCode) {
			// Callback phase - exchange code for token
			this.handleCallback(req, options);
		} else {
			// Authorization phase - redirect to Zalo
			this.handleAuthorization(req, options);
		}
	}

	/**
	 * Handle authorization redirect to Zalo
	 */
	private handleAuthorization(req: Request, options: AuthenticateOptions): void {
		const stateStore = this._stateStore;
		const customState = options.state as string | undefined;

		const oauth2 = this._oauth2 as unknown as {
			_authorizeUrl: string;
			_accessTokenUrl: string;
			_clientId: string;
		};

		// Generate PKCE verifier and challenge (S256 method)
		const verifier = base64url(crypto.randomBytes(32));
		const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());

		const meta = {
			authorizationURL: oauth2._authorizeUrl,
			tokenURL: oauth2._accessTokenUrl,
			clientID: this._appId,
		};

		const storeState = customState || crypto.randomBytes(16).toString('hex');

		stateStore.store(req, verifier, storeState, meta, (err, handle) => {
			if (err) {
				return this.error(err);
			}

			// Build Zalo authorization URL with PKCE parameters
			const parsed = url.parse(oauth2._authorizeUrl, true);
			parsed.query = {
				app_id: this._appId,
				redirect_uri: options.callbackURL || this._zaloCallbackURL,
				code_challenge: challenge,
				code_challenge_method: 'S256',
				state: handle || storeState,
			};
			delete parsed.search;
			const location = url.format(parsed);

			this.redirect(location);
		});
	}

	/**
	 * Handle callback from Zalo - exchange code for token
	 */
	private handleCallback(req: Request, options: AuthenticateOptions): void {
		const query = req.query as Record<string, string>;
		const code = query.code;
		const state = query.state;

		if (query.error) {
			return this.fail({ message: query.error_description || query.error });
		}

		if (!code) {
			return this.fail({ message: 'Missing authorization code' });
		}

		const stateStore = this._stateStore;

		// Verify state and get code_verifier
		stateStore.verify(req, state, (err, verifier) => {
			if (err) {
				return this.error(err);
			}

			if (!verifier) {
				return this.fail({ message: 'Invalid state parameter' });
			}

			// Exchange code for token using Zalo's custom endpoint
			this.getOAuthAccessToken(
				code,
				verifier,
				options.callbackURL || this._zaloCallbackURL,
				(tokenErr, accessToken, refreshToken) => {
					if (tokenErr) {
						return this.error(tokenErr);
					}

					// Get user profile
					this.userProfile(accessToken, (profileErr, profile) => {
						if (profileErr) {
							return this.error(profileErr);
						}

						const verified: ZaloVerifyCallback = (verifyErr, user, info) => {
							if (verifyErr) {
								return this.error(verifyErr);
							}
							if (!user) {
								return this.fail(info);
							}
							this.success(user, info || {});
						};

						try {
							if (this._passReqToCallback) {
								(this._zaloVerify as ZaloVerifyFunctionWithRequest)(req, accessToken, refreshToken, profile, verified);
							} else {
								(this._zaloVerify as ZaloVerifyFunction)(accessToken, refreshToken, profile, verified);
							}
						} catch (ex) {
							return this.error(ex as Error);
						}
					});
				},
			);
		});
	}

	/**
	 * Get OAuth access token from Zalo using custom endpoint
	 * Zalo requires: POST with secret_key header and code_verifier in body
	 */
	private getOAuthAccessToken(
		code: string,
		codeVerifier: string,
		_redirectUri: string,
		done: (err: Error | null, accessToken?: string, refreshToken?: string) => void,
	): void {
		const tokenUrl = new URL('https://oauth.zaloapp.com/v4/access_token');
		const params = new URLSearchParams({
			app_id: this._appId,
			code: code,
			grant_type: 'authorization_code',
			code_verifier: codeVerifier,
		});

		const requestOptions = {
			hostname: tokenUrl.hostname,
			path: tokenUrl.pathname,
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'Content-Length': Buffer.byteLength(params.toString()),
				secret_key: this._appSecret,
			},
		};

		const req = https.request(requestOptions, (res) => {
			let data = '';
			res.on('data', (chunk) => (data += chunk.toString()));
			res.on('end', () => {
				try {
					const result = JSON.parse(data) as {
						access_token?: string;
						refresh_token?: string;
						expires_in?: number;
					} & ZaloTokenError;

					if (result.error) {
						return done(
							new Error(
								result.error_description || result.error_reason || result.error_name || 'Failed to obtain access token',
							),
						);
					}

					done(null, result.access_token, result.refresh_token);
				} catch {
					done(new Error('Failed to parse token response'));
				}
			});
		});

		req.on('error', (error) => done(error));
		req.write(params.toString());
		req.end();
	}
}
