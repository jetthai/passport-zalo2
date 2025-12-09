/**
 * @public
 */
export interface Profile {
	provider: string;
	id: string;
	displayName: string;
	name?: string;
	birthday?: string;
	gender?: string;
	picture?: string;
	photos?: Array<{
		value: string;
	}>;
}

/**
 * @public
 */
export interface ProfileWithMetaData extends Profile {
	_raw?: string | Buffer;
	_json: unknown;
}
