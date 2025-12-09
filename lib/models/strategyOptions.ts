import { Request } from 'express';
import {
	StrategyOptions as PassportOAuth2StrategyOptions,
	StrategyOptionsWithRequest as PassportOAuth2StrategyOptionsWithRequest,
} from 'passport-oauth2';

/**
 * Callback type for store operation.
 * @public
 */
export type StoreCallback = (err: Error | null, handle?: string) => void;

/**
 * Callback type for verify operation.
 * @public
 */
export type VerifyCallback = (err: Error | null, ok?: string | false, state?: string) => void;

/**
 * Custom PKCE state store interface for storing code_verifier.
 * Implement this interface to use external storage (e.g., Redis, database)
 * instead of express-session for PKCE state management.
 *
 * @public
 */
export interface PKCEStore {
	/**
	 * Store the PKCE code_verifier and optional state.
	 *
	 * @param req - Express request object
	 * @param verifier - The PKCE code_verifier to store
	 * @param state - Optional state parameter
	 * @param meta - Metadata object (usually empty)
	 * @param callback - Callback with error or the handle (state identifier)
	 */
	store(req: Request, verifier: string, state: string | null, meta: object, callback: StoreCallback): void;

	/**
	 * Verify and retrieve the stored PKCE code_verifier.
	 *
	 * @param req - Express request object
	 * @param providedState - The state parameter returned from the authorization server
	 * @param callback - Callback with error, code_verifier (or false if invalid), and optional state
	 */
	verify(req: Request, providedState: string, callback: VerifyCallback): void;
}

interface ZaloStrategyOptionsBase {
	appId: string;
	appSecret: string;
	callbackURL: string;
	userProfileURL?: string;
	authorizationURL?: string;
	tokenURL?: string;
	/**
	 * Custom PKCE state store for storing code_verifier.
	 * Use this option when you don't have express-session available
	 * (e.g., in serverless or microservice environments).
	 * The store must implement the PKCEStore interface.
	 */
	store?: PKCEStore;
}

/**
 * @public
 */
export interface StrategyOptions
	extends ZaloStrategyOptionsBase,
		Omit<
			PassportOAuth2StrategyOptions,
			'authorizationURL' | 'tokenURL' | 'store' | 'clientID' | 'clientSecret' | 'callbackURL'
		> {
	passReqToCallback?: false;
}

/**
 * @public
 */
export interface StrategyOptionsWithRequest
	extends ZaloStrategyOptionsBase,
		Omit<
			PassportOAuth2StrategyOptionsWithRequest,
			'authorizationURL' | 'tokenURL' | 'store' | 'clientID' | 'clientSecret' | 'callbackURL'
		> {
	passReqToCallback: true;
}

export const isStrategyOptions = (
	options: StrategyOptions | StrategyOptionsWithRequest,
): options is StrategyOptions => {
	return !options.passReqToCallback;
};

export const isStrategyOptionsWithRequest = (
	options: StrategyOptions | StrategyOptionsWithRequest,
): options is StrategyOptionsWithRequest => {
	return options.passReqToCallback === true;
};

/**
 * @public
 */
export interface AuthenticateOptions {
	scope?: string[] | string;
	state?: unknown;
	callbackURL?: string;
	failureRedirect?: string;
	failureMessage?: boolean;
}
