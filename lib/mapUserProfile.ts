import { Profile, ZaloUserInfoResponse } from './models';

export const mapUserProfile = (json: string | ZaloUserInfoResponse): Profile => {
	let parsedJson: ZaloUserInfoResponse;
	if ('string' === typeof json) {
		parsedJson = JSON.parse(json) as unknown as ZaloUserInfoResponse;
	} else {
		parsedJson = json;
	}

	const pictureUrl = parsedJson.picture?.data?.url;
	const photos = pictureUrl ? [{ value: pictureUrl }] : [];

	return {
		provider: 'zalo',
		id: parsedJson.id,
		displayName: parsedJson.name,
		name: parsedJson.name,
		birthday: parsedJson.birthday,
		gender: parsedJson.gender,
		picture: pictureUrl,
		photos,
	};
};
