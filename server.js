const bodyParser = require("body-parser");
const express = require("express");
const morgan = require("morgan");
const path = require("path");

const config = require("./config");
const model = require("./model");
const utils = require("./utils");

const app = express();
app.set("trust proxy", true);
app.use(express.static(path.join(__dirname, "node_modules/vue/dist/"), { maxAge: 0 }));
app.use(express.static(path.join(__dirname, "node_modules/axios/dist/"), { maxAge: 0 }));
app.use("/page.js", express.static(path.join(__dirname, "node_modules/page/page.js"), { maxAge: 0 }));
app.use(express.static(path.join(__dirname, "www"), { maxAge: 0 }));
app.use(express.static(path.join(__dirname, "icons")));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(morgan("dev")); // for dev logging

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "www/index.html")));

app.post("/api/register", utils.rateLimit(), model.register);
app.post("/api/login", utils.rateLimit(), model.login);
app.put("/api/profile", utils.rateLimit(), model.authorize, model.updateProfile);
app.post("/api/post", utils.rateLimit({ skipFailedRequests: true }), model.authorize, model.newPost);
app.get("/api/posts", model.authorize, model.getPosts);
app.get("/api/mentions", model.authorize, model.getMentions);
app.delete("/api/post/:id", utils.rateLimit(), model.authorize, model.deletePost);
app.delete("/api/logout", model.authorize, model.logout);
app.get("/api/iptolocation", model.ipToLocation);
app.get("/api/ping", model.ping);

app.get("/*", (req, res) => res.status(404).sendFile(path.join(__dirname, "www/404.html")));

app.use((err, req, res, next) => {
	if (err.httpErrorCode) {
		res.status(err.httpErrorCode).json({ message: err.message || "Something went wrong" });
	} else {
		next(err);
	}
});

// Handle the unknown errors
app.use((err, req, res, next) => {
	console.error(err);
	res.status(500).json({ message: "Something went wrong" });
});

app.listen(config.PORT, null, function() {
	console.log("Listening on port " + config.PORT);
});
