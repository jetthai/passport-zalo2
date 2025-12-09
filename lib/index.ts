import { Strategy } from './strategy';

export type {
	Profile,
	ProfileWithMetaData,
	StrategyOptions,
	StrategyOptionsWithRequest,
	AuthenticateOptions,
	PKCEStore,
	StoreCallback,
	VerifyCallback,
} from './models';
export type { ZaloVerifyCallback, ZaloVerifyFunction, ZaloVerifyFunctionWithRequest } from './strategy';
export { Strategy };

exports = module.exports = Strategy;
exports.Strategy = Strategy;
