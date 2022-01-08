const crypto = require("crypto");
const uuid = require("uuid").v4;

const utils = require("./utils");
const config = require("./config");

const { Users, Posts } = require("./database").getInstance();

const fcmadmin = require("firebase-admin");
if (config.FCM_SERVICE_ACCOUNT) {
	fcmadmin.initializeApp({
		credential: fcmadmin.credential.cert(JSON.parse(config.FCM_SERVICE_ACCOUNT)),
	});
}

const register = async (req, res, next) => {
	try {
		const handle = utils.getValidHandle(req.body.handle);
		const password = utils.getValidPassword(req.body.password);

		const existingUser = await Users.findOne({ handle }).exec();
		const token = uuid();

		if (existingUser) {
			return utils.httpError(400, "Handle already taken");
		} else if (!existingUser) {
			await new Users({ handle, password, token }).save();
		}
		res.json({ message: "Registration successful", token, handle });
	} catch (error) {
		next(error);
	}
};

const login = async (req, res, next) => {
	try {
		const handle = utils.getValidHandle(req.body.handle);
		const password = utils.hashString(req.body.password);

		const loginUser = await Users.findOne({ handle }).exec();
		const token = uuid();

		if (!loginUser) {
			return utils.httpError(400, "User does not exist");
		} else if (loginUser && loginUser.password !== password) {
			return utils.httpError(400, "Handle / password do not match");
		} else {
			await Users.updateOne({ _id: loginUser._id }, { token, lastLogin: new Date() });
		}
		res.json({ message: "Login successful", token, handle });
	} catch (error) {
		next(error);
	}
};

const authorize = async (req, res, next) => {
	try {
		const token = utils.getAccessToken(req.headers);

		if (!token && req.path === "/api/posts" && req.method === "GET") return next();
		if (!token) return utils.httpError(401, "Unauthorized. Please refresh");

		req["user"] = await Users.findOne({ token });
		!req["user"] ? utils.httpError(401, "Unauthorized. Please refresh") : next();
	} catch (error) {
		next(error);
	}
};

const updateProfile = async (req, res, next) => {
	try {
		const password = req.body.password ? utils.getValidPassword(req.body.password) : null;
		const email = req.body.email ? utils.getValidEmail(req.body.email) : null;
		const deviceToken = req.body.devicetoken;
		const color = req.body.color ? utils.getValidHexColor(req.body.color) : null;

		const updateFields = {};
		if (password) updateFields["password"] = password;
		if (email) updateFields["email"] = email;
		if (color) updateFields["color"] = color;
		if (deviceToken) updateFields["deviceToken"] = deviceToken;
		else if (deviceToken === "") updateFields["$unset"] = { deviceToken: 1 };

		await Users.updateOne({ _id: req.user._id }, { ...updateFields, lastSeenOn: new Date() });
		res.json({ message: "Profile updated" });
	} catch (error) {
		next(error);
	}
};

const newPost = async (req, res, next) => {
	try {
		const text = await utils.getValidPost(req.body.text);
		const location = await Promise.all([
			utils.getValidLongitude(req.body.longitude),
			utils.getValidLatitude(req.body.latitude),
		]);
		let mentions = await utils.getMentions(text); // mentions = @mentioned texts

		const newPostObject = { from: req.user._id, text, location };

		if (mentions.length > 0) {
			const mentionsRegex = mentions.map((m) => new RegExp("^" + m + "$", "i"));
			mentions = await Users.find({ handle: { $in: mentionsRegex } }, ["_id", "handle", "deviceToken"]).exec();

			if (mentions.length > 0) {
				newPostObject["mentions"] = mentions;

				const conversationId = [...new Set([req.user._id, ...mentions.map((u) => u._id)])].sort().join("");
				newPostObject["conversationId"] = crypto
					.createHash("md5")
					.update(conversationId)
					.digest("hex");
			}
		}

		const post = await new Posts(newPostObject).save();
		res.json({ ...utils.postFormatter({ ...post, from: req.user }, location) });

		if (config.FCM_SERVICE_ACCOUNT) {
			//send push notifications to mentioned users
			if (mentions.length > 0) {
				mentions.forEach((m) => {
					if (m.deviceToken) {
						fcmadmin.messaging().send({
							data: { title: "@" + req.user.handle + " mentioned you", body: text },
							token: m.deviceToken,
						});
					}
				});
			}
			//send push notifications to near by users
			const nearByUsersWithToken = await Users.find(
				{
					_id: { $ne: req.user._id },
					handle: { $nin: mentions.map((m) => m.handle) },
					deviceToken: { $exists: true },
					location: {
						$geoWithin: {
							$centerSphere: [location, 10 / 6371],
						},
					},
				},
				["deviceToken"]
			).exec();
			nearByUsersWithToken.forEach((u) => {
				fcmadmin.messaging().send({
					data: { title: "@" + req.user.handle + " posted near you", body: text },
					token: u.deviceToken,
				});
			});
		}
	} catch (error) {
		next(error);
	}
};

const getPosts = async (req, res, next) => {
	try {
		const q = req.query.q;
		const conversationId = req.query.cid;
		const location = await Promise.all([
			utils.getValidLongitude(req.query.longitude),
			utils.getValidLatitude(req.query.latitude),
		]);
		const skip = Number(req.query.skip) || 0;
		const lastDate = req.query.lastdate;
		let radius = req.query.radius;

		const locationQuery = {
			$geoWithin: {
				$centerSphere: [location, (radius > config.MAX_RADIUS ? config.MAX_RADIUS : radius) / 6371],
			},
		};

		let query = {};
		if (conversationId) {
			query["conversationId"] = conversationId;
		} else if (req.user) {
			query["$or"] = [{ location: locationQuery }, { from: req.user._id }, { mentions: req.user._id }];
		} else {
			query["location"] = locationQuery;
		}
		// query["from"] = { $nin: req.user.blocked };
		if (lastDate) query["date"] = { $gt: new Date(lastDate) };
		if (q) query["$text"] = { $search: q };

		const posts = await Posts.find(query)
			.populate([
				{ path: "from", select: "handle" },
				{ path: "mentions", select: "handle" },
			])
			.skip(skip)
			.limit(config.PAGE_LIMIT)
			.sort("-date")
			.exec();
		res.json({ posts: posts.map((p) => utils.postFormatter(p, location)) });

		if (req.user) {
			await Users.updateOne({ _id: req.user._id }, { location, lastSeenOn: new Date() });
		}
	} catch (error) {
		next(error);
	}
};

const getMentions = async (req, res, next) => {
	try {
		const location = await Promise.all([
			utils.getValidLongitude(req.query.longitude),
			utils.getValidLatitude(req.query.latitude),
		]);
		const skip = Number(req.query.skip) || 0;
		const lastDate = req.query.lastdate;

		let query = { $or: [{ from: req.user._id }, { mentions: req.user._id }] };
		if (lastDate) query["date"] = { $gt: new Date(lastDate) };

		const posts = await Posts.find(query)
			.populate([
				{ path: "from", select: "handle" },
				{ path: "mentions", select: "handle" },
			])
			.skip(skip)
			.limit(config.PAGE_LIMIT)
			.sort("-date")
			.exec();
		res.json({ posts: posts.map((p) => utils.postFormatter(p, location)) });

		if (req.user) {
			await Users.updateOne({ _id: req.user._id }, { location, lastSeenOn: new Date() });
		}
	} catch (error) {
		next(error);
	}
};

const deletePost = async (req, res, next) => {
	try {
		const postId = req.params.id;
		const { deletedCount } = await Posts.deleteOne({ _id: postId, from: req.user._id });
		utils.httpError(deletedCount ? 200 : 400, deletedCount ? "Post deleted" : "Invalid request");
	} catch (error) {
		next(error);
	}
};

const logout = async (req, res, next) => {
	try {
		await Users.updateOne({ _id: req.user._id }, { $unset: { deviceToken: 1, token: 1 }, lastSeenOn: new Date() });
		res.json({ message: "Logged out successfully" });
	} catch (error) {
		next(error);
	}
};

const ipToLocation = async (req, res, next) => {
	try {
		const { lat: latitude, lon: longitude } = await utils.ipToLocation(req.ip);
		if (latitude && longitude) res.json({ coords: { latitude, longitude } });
		else utils.httpError(400, "Unable to get your location");
	} catch (error) {
		next(error);
	}
};

const ping = async (req, res, next) => {
	try {
		const results = await Promise.all([Users.estimatedDocumentCount(), Posts.estimatedDocumentCount()]);
		res.json({ users: results[0], posts: results[1] });
	} catch (error) {
		next(error);
	}
};

module.exports = {
	register,
	login,
	authorize,
	updateProfile,
	newPost,
	getPosts,
	getMentions,
	deletePost,
	logout,
	ipToLocation,
	ping,
};
