export interface ZaloUserInfoResponse {
	id: string;
	name: string;
	birthday?: string;
	gender?: string;
	picture?: {
		data?: {
			url?: string;
		};
	};
	error?: number;
	message?: string;
}
