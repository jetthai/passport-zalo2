import { StrategyOptions, StrategyOptionsWithRequest } from 'passport-oauth2';

export interface ZaloStrategyOptions extends StrategyOptions {
	appId: string;
	appSecret: string;
}

export interface ZaloStrategyOptionsWithRequest extends StrategyOptionsWithRequest {
	appId: string;
	appSecret: string;
}
