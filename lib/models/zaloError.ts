export interface ZaloError {
	error?: number;
	error_name?: string;
	error_reason?: string;
	ref_doc?: string;
	message?: string;
}

export interface ZaloTokenError {
	error?: number;
	error_name?: string;
	error_description?: string;
	error_reason?: string;
}
