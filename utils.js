const axios = require("axios");
const crypto = require("crypto");
const rateLimiter = require("express-rate-limit");
const config = require("./config");

const rateLimit = (options) => {
	return rateLimiter({
		windowMs: 5 * 60 * 1000, // 5 minute
		max: 50, // 50 requests
		headers: false,
		keyGenerator: (req) => (req.user ? req.user._id : req.ip),
		handler: (req, res) => res.status(429).json({ message: "Too many requests" }),
		...options,
	});
};

const getValidHandle = (handle) => {
	if (!handle) return httpError(400, "Invalid handle");
	if (config.INVALID_HANDLES.includes(handle.toLowerCase())) return httpError(400, "Invalid handle");
	const handleRegex = /^([a-zA-Z0-9_]){1,18}$/;
	if (!handleRegex.test(handle.toLowerCase())) return httpError(400, "Handle can have only alphanumeric chars & _");
	return handle.toLowerCase();
};

const getValidPassword = (password) => {
	if (!password) return httpError(400, "Password cannot be empty.");
	if (password.length < 8) return httpError(400, "Password length should be at least 6 chars");
	return hashString(password);
};

const getValidEmail = (email) => {
	if (!validateEmail(email)) return httpError(400, "Invalid email address");
	return email;
};
const validateEmail = (email) => {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const getValidHexColor = (color) => (/^#[0-9A-F]{6}$/i.test(color) ? color : null);

const getAccessToken = (headers) => {
	if (!headers.authorization) return "";
	return headers.authorization.split(" ")[1];
};

const getValidLongitude = (longitude) => {
	if (longitude && longitude <= 180 && longitude >= -180) return longitude;
	else httpError(400, "Invalid location co-ordinates.");
};

const getValidLatitude = (latitude) => {
	if (latitude && latitude <= 90 && latitude >= -90) return latitude;
	else httpError(400, "Invalid location co-ordinates.");
};

const getValidPost = (text) => {
	if (!text) httpError(400, "Empty post");
	if (text.length > 160) httpError(400, "Post is too long. Max. 160 chars");
	const tagsToReplace = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
	const replaceTag = (tag) => tagsToReplace[tag] || tag;
	const safe_tags_replace = (str) => str.replace(/[&<>]/g, replaceTag);
	return safe_tags_replace(text);
};

const getMentions = (message) => {
	const pattern = /\B@[a-zA-Z0-9_]+/gi;
	const matches = message.match(pattern) || [];
	return matches.map((u) => u.substring(1)).sort();
};

const calculateDistance = (lat1, lon1, lat2, lon2) => {
	if (lat1 == lat2 && lon1 == lon2) return 0;
	const p = Math.PI / 180;
	const c = Math.cos;
	const a = 0.5 - c((lat2 - lat1) * p) / 2 + (c(lat1 * p) * c(lat2 * p) * (1 - c((lon2 - lon1) * p))) / 2;
	return Math.asin(Math.sqrt(a)) * 2 * 6371;
};

const hashString = (str) => {
	return crypto
		.createHash("sha256", config.SECRET)
		.update(str)
		.digest("hex");
};

const postFormatter = (post, geo) => {
	const { _id, text, date, location, mentions } = post._doc;
	const { from } = post;
	return {
		_id,
		text,
		date,
		from: { _id: from._id, handle: from.handle },
		mentions: mentions ? mentions.map((m) => m.handle) : [],
		distance: calculateDistance(geo[1], geo[0], location[1], location[0]).toFixed(1) || 0,
	};
};

const ipToLocation = async (ip) => {
	if (!ip) return null;
	try {
		const { data } = await axios.get(`http://ip-api.com/json/${ip}`);
		return data;
	} catch (err) {
		console.log(err);
		return null;
	}
};

//Throws a error which can be handled and changed to HTTP Error in the Express js Error handling middleware.
const httpError = (code, message) => {
	code = code ? code : 500;
	message = message ? message : "Something went wrong";
	const errorObject = new Error(message);
	errorObject.httpErrorCode = code;
	throw errorObject;
};

module.exports = {
	rateLimit,
	getValidHandle,
	getValidPassword,
	getValidEmail,
	getValidHexColor,
	getAccessToken,
	getValidLongitude,
	getValidLatitude,
	getValidPost,
	getMentions,
	calculateDistance,
	hashString,
	postFormatter,
	ipToLocation,
	httpError,
};
