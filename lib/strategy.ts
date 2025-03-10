import OAuth2Strategy, { VerifyFunction, VerifyFunctionWithRequest } from 'passport-oauth2';
import { ZaloStrategyOptions, ZaloStrategyOptionsWithRequest } from './options';
import { Request } from 'express';
import https from 'https';

export class Strategy extends OAuth2Strategy {
	private readonly _authURL: string = 'https://oauth.zaloapp.com/v4/permission';
	private readonly _accessTokenURL: string = 'https://oauth.zaloapp.com/v4/access_token';
	private readonly _profileURL: string = 'https://graph.zalo.me/v2.0/me';

	constructor(_options: ZaloStrategyOptions, _verify: VerifyFunction);
	constructor(_options: ZaloStrategyOptionsWithRequest, _verify: VerifyFunctionWithRequest);

	constructor(
		private readonly _options: ZaloStrategyOptions | ZaloStrategyOptionsWithRequest,
		private readonly _verify: VerifyFunction | VerifyFunctionWithRequest,
	) {
		if (!_verify) throw new TypeError('ZaloStrategy requires a verify callback');
		if (!_options.appId) throw new TypeError('ZaloStrategy requires an appId option');
		if (!_options.appSecret) throw new TypeError('ZaloStrategy requires an appSecret option');
		if (!_options.callbackURL) throw new TypeError('ZaloStrategy require an Callback URL option');
		if (_options.passReqToCallback) {
			super(_options, _verify as VerifyFunctionWithRequest);
		} else {
			super(_options as ZaloStrategyOptions, _verify as VerifyFunction);
		}
		this.name = 'zalo';
	}

	/**
	 * Authenticate request.
	 *
	 * This function must be overridden by subclasses.  In abstract form, it always
	 * throws an exception.
	 *
	 * @param {Object} req The request to authenticate.
	 * @param {Object} [options] Strategy-specific options.
	 * @api public
	 */
	public authenticate(req: Request, options?: any): void {
		options = options || {};
		if (req.query && req.query.code) {
			// 如果有授權碼，獲取訪問令牌
			this.getOAuthAccessToken(req.query.code as string, (status, oauthData) => {
				if (status === 'error') {
					return this.error(oauthData);
				}
				// 獲取用戶資料
				this.getUserProfile(oauthData, (profileStatus, profileData) => {
					if (profileStatus === 'error') {
						return this.error(profileData);
					}
					if (this._options.passReqToCallback) {
						(this._verify as VerifyFunctionWithRequest)(
							req,
							oauthData.access_token,
							null,
							null,
							profileData,
							(err, user, info) => {
								if (err) return this.error(err);
								if (!user) return this.fail(info);
								this.success(user, info || {});
							},
						);
					} else {
						(this._verify as VerifyFunction)(oauthData.access_token, null, null, profileData, (err, user, info) => {
							if (err) return this.error(err);
							if (!user) return this.fail(info);
							this.success(user, info || {});
						});
					}
				});
			});
		} else {
			const authUrl = new URL(this._authURL);
			authUrl.searchParams.set('app_id', this._options.appId);
			authUrl.searchParams.set('redirect_uri', this._options.callbackURL);
			if (options.state) {
				authUrl.searchParams.set('state', options.state);
			}
			this.redirect(authUrl.toString());
		}
	}

	/**
	 * Get access token when have code return from request permission
	 * URL to load is: https://oauth.zaloapp.com/v3/access_token?app_id={1}&app_secret={2}&code={3}
	 *
	 * @param {String} code
	 * @param {Function} done
	 * @api private
	 */
	private getOAuthAccessToken(code: string, done: (status: string, oauthData: any) => void): void {
		const tokenUrl = new URL(this._accessTokenURL);
		const params = new URLSearchParams({
			app_id: this._options.appId,
			code: code,
			grant_type: 'authorization_code',
		});

		const requestOptions = {
			port: 443,
			hostname: tokenUrl.hostname,
			path: tokenUrl.pathname,
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'Content-Length': Buffer.byteLength(params.toString()),
				secret_key: this._options.appSecret,
			},
		};

		const req = https.request(requestOptions, (res) => {
			let data = '';
			res.on('data', (chunk) => (data += chunk.toString()));
			res.on('end', () => {
				try {
					const result = JSON.parse(data);
					done('success', result);
				} catch (error) {
					done('error', error);
				}
			});
		});

		req.on('error', (error) => done('error', error));
		req.write(params.toString());
		req.end();
	}

	/**
	 * Load basic user profile when we have access token
	 * URL to load is: https://graph.zalo.me/v2.0/me?access_token=<User_Access_Token>&fields=id,birthday,name,gender,picture
	 *
	 * @param {Object} oauthData
	 * @param {Function} done
	 * @api private
	 */
	private getUserProfile(oauthData: { access_token: string }, done: (status: string, profile: any) => void): void {
		const profileUrl = new URL(this._profileURL);
		profileUrl.searchParams.set('access_token', oauthData.access_token);
		profileUrl.searchParams.set('fields', 'id,birthday,name,gender,picture'); // 根據實際 API 調整

		const requestOptions = {
			hostname: profileUrl.hostname,
			path: profileUrl.pathname + profileUrl.search,
			method: 'GET',
		};

		const req = https.request(requestOptions, (res) => {
			let data = '';
			res.on('data', (chunk) => (data += chunk.toString()));
			res.on('end', () => {
				try {
					const profile = JSON.parse(data);
					done('success', profile);
				} catch (error) {
					done('error', error);
				}
			});
		});

		req.on('error', (error) => done('error', error));
		req.end();
	}
}
