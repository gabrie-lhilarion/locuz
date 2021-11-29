/* global firebase, axios, Vue */

const defaultState = function() {
	return {
		online: true,
		visible: true,
		locating: false,
		locationError: false,
		geoLocation: null,
		showLogin: false,
		showPassword: false,
		showSettings: false,
		authCredentials: { handle: "", password: "" },
		toast: { type: "", message: "", time: new Date().getTime() },
		handle: window.localStorage.handle,
		token: window.localStorage.token,
		newPost: "",
		showMentions: false,
		radius: window.localStorage.radius ?? 10,
		query: "",
		newPassword: "",
		posts: [],
		initFetchCompleted: false,
		fetchingPosts: false,
		showLoadMore: false,
	};
};
const App = new Vue({
	el: "#app",
	data: defaultState,
	computed: {
		page: function() {
			if (this.locating) return "";
			else if (!this.token && !this.geoLocation) return "intro";
			else if (this.showSettings) return "settings";
			else if (!this.token && this.geoLocation) return "login";
			else if (this.token) return "home";
		},
	},
	methods: {
		init: function() {
			this.locating = true;
			this.getCurrentLocation()
				.then(this.setLocation)
				.catch(() => {
					this.locationError = true;
				})
				.finally(() => (this.locating = false));
		},
		getCurrentLocation: function() {
			return new Promise((resolve, reject) => {
				navigator.geolocation.getCurrentPosition(
					resolve,
					(e) => {
						cabin.event(`location-error/${e.code}${this.handle ? "/" + this.handle : ""}`);
						axios
							.get("/api/iptolocation")
							.then((response) => resolve(response.data))
							.catch(reject);
					},
					{ maximumAge: 60000, timeout: 10000, enableHighAccuracy: true }
				);
			});
		},
		setNetworkStatus: function() {
			this.online = navigator.onLine;
		},
		setVisibility: function() {
			this.visible = document.visibilityState === "visible";
		},
		setToast: function(message, type = "error") {
			this.toast = { type, message, time: new Date().getTime() };
			setTimeout(() => {
				if (new Date().getTime() - this.toast.time >= 3000) {
					this.toast.message = "";
				}
			}, 4000);
		},
		setLocation: function({ coords }) {
			this.locationError = false;
			cabin.event(`location-success${this.handle ? "/" + this.handle : ""}`);
			const { latitude, longitude } = coords;
			this.geoLocation = { latitude, longitude };
			this.getPosts();
			if (this.handle) {
				firebaseMessagingInit();
			} else {
				this.startIntervalFetch();
			}
		},
		updateRadius: function() {
			this.radius = this.radius < 1 ? 1 : this.radius > 10000 ? 10000 : this.radius;
			this.posts = [];
			this.getPosts();
			window.localStorage.radius = this.radius;
		},
		register: function() {
			axios.post("/api/register", this.authCredentials).then((r) => {
				cabin.event(`new-user/${r.data.handle}`);
				this.onAuthSuccess(r);
			});
		},
		login: function() {
			axios.post("/api/login", this.authCredentials).then((r) => {
				cabin.event(`login/${r.data.handle}`);
				this.onAuthSuccess(r);
			});
		},
		updatePassword: function() {
			if (this.newPassword) {
				axios.put("/api/profile", { password: this.newPassword }).then(() => {
					this.newPassword = "";
					this.setToast("Password updated", "success");
				});
			}
		},
		onAuthSuccess: function(response) {
			window.localStorage.token = this.token = response.data.token;
			window.localStorage.handle = this.handle = response.data.handle;
			this.messages = [];
			this.getPosts();
			this.showLogin = false;
			axios.defaults.headers.common["Authorization"] = "TOKEN " + response.data.token;
		},
		submitPost: function(e) {
			e.preventDefault();
			axios
				.post("/api/post", {
					...this.geoLocation,
					text: this.newPost,
				})
				.then(({ data }) => {
					this.posts.unshift(data);
					this.newPost = "";
					document.getElementById("sharefield").textContent = "";
					document.getElementById("sharefield").blur();
				});
		},
		getPosts: function(fetchNew) {
			if (this.online && !this.fetchingPosts && this.geoLocation) {
				this.fetchingPosts = true;
				let params = { ...this.geoLocation, radius: this.radius };
				if (!fetchNew && this.posts.length > 0) params["skip"] = this.posts.length;
				if (fetchNew && this.posts.length > 0) params["lastdate"] = this.posts[0].date;
				axios
					.get(`/api/${this.showMentions ? "mentions" : "posts"}`, { params })
					.then(({ data: response }) => {
						this.initFetchCompleted = true;
						if (response.posts.length > 0) {
							if (fetchNew) response.posts.reverse().forEach((m) => this.posts.unshift(m));
							else response.posts.forEach((m) => this.posts.push(m));
							if (!fetchNew) this.showLoadMore = response.posts.length == 50;
						}
					})
					.finally((e) => (this.fetchingPosts = false));
			}
		},
		startIntervalFetch: function() {
			setInterval(() => {
				if (this.online && this.visible) this.getPosts(true);
			}, 10000);
		},
		deletePost: function(id) {
			axios.delete("/api/post/" + id).then(() =>
				this.posts.splice(
					this.posts.findIndex((m) => m._id == id),
					1
				)
			);
		},
		onFeedChange: function(type) {
			this.showMentions = type === "mentions" ? true : false;
			this.posts = [];
			this.getPosts();
			this.showSettings = false;
			this.initFetchCompleted = false;
		},
		setNewPostText: function(e) {
			this.newPost = e.srcElement.textContent;
		},
		paste: function(e) {
			e.preventDefault();
			const clipboardData = e.clipboardData || window.clipboardData;
			const pastedText = clipboardData.getData("Text");
			document.execCommand("inserttext", false, pastedText.replace(/(\r\n\t|\n|\r\t)/gm, " "));
		},
		setMentions: function(mentions, handle) {
			if (this.token) {
				const placeCaretAtEnd = (el) => {
					el.focus();
					let range = document.createRange();
					range.selectNodeContents(el);
					range.collapse(false);
					let sel = window.getSelection();
					sel.removeAllRanges();
					sel.addRange(range);
				};

				const setMentions = () => {
					let users = [handle, ...mentions].filter((u, i, s) => s.indexOf(u) === i).map((u) => "@" + u);
					// if users count is > 1, then remove own handle
					if (users.length > 1) {
						users = users.filter((u) => "@" + this.handle !== u);
					}
					const message =
						this.newPost +
						((this.newPost.length > 0 && this.newPost.slice(-1) != " " ? " " : "") + users.join(" ") + "\t\b");
					this.newPost = document.getElementById("sharefield").textContent = message;
					placeCaretAtEnd(document.getElementById("sharefield"));
				};
				this.newPost = this.newPost ? this.newPost : " ";
				setTimeout(setMentions, 0);
			} else {
				this.setToast("Please signin to reply");
			}
		},
		formatDate: function(datestring) {
			const seconds = Math.floor((new Date() - new Date(datestring)) / 1000);
			let interval = seconds / 31536000;
			if (interval > 1) return Math.floor(interval) + "Y";
			interval = seconds / 2592000;
			if (interval > 1) return Math.floor(interval) + "M";
			interval = seconds / 86400;
			if (interval > 1) return Math.floor(interval) + "d";
			interval = seconds / 3600;
			if (interval > 1) return Math.floor(interval) + "h";
			interval = seconds / 60;
			if (interval > 1) return Math.floor(interval) + "m";
			return "now";
		},
		formatDistance: function(distance) {
			return (distance < 10 ? (distance == 0 ? 0 : distance) : Math.round(distance)) + "km";
		},
		linkify: function(str) {
			return str.replace(/(?:(?:https?|ftp):\/\/)?[\w/\-?=%.]+\.[\w/\-?=%]+/gi, (match) => {
				let displayURL = match
					.trim()
					.replace("https://", "")
					.replace("https://", "");
				displayURL = displayURL.length > 25 ? displayURL.substr(0, 25) + "&hellip;" : displayURL;
				const url = !/^https?:\/\//i.test(match) ? "http://" + match : match;
				return `<a href="${url}" target="_blank" class="link" rel="noopener">${displayURL}</a>`;
			});
		},
		logout: function() {
			if (confirm("Are you sure you want to sign out?")) {
				axios.delete("/api/logout").then(() => {
					window.localStorage.token = "";
					window.localStorage.handle = "";
					window.localStorage.radius = 10;
					delete axios.defaults.headers.common["Authorization"];
					const newState = defaultState();
					Object.keys(newState).map((key) => (this[key] = newState[key]));
				});
			}
		},
	},
});

const firebaseConfig = {
	apiKey: "AIzaSyAbrOb7azsr-paOrtJacKkjfkwxSvNDdTo",
	authDomain: "locuzapp.firebaseapp.com",
	projectId: "locuzapp",
	storageBucket: "locuzapp.appspot.com",
	messagingSenderId: "68348347529",
	appId: "1:68348347529:web:bb8bcf157c6e80c5103258",
};
firebase.initializeApp(firebaseConfig);

const firebaseMessagingInit = () => {
	try {
		const messaging = firebase.messaging();
		if ("Notification" in window) {
			Notification.requestPermission().then((permission) => {
				if (permission === "granted") {
					messaging
						.getToken({
							vapidKey: "BEeng6pN3MvZG0Cs2tNhSbUsfmC0G9FdIHGxM5oxnRL_Un_smfWYFtUrH9etoIrYNOwjserZ9SzE9YAxpN3N2-w",
						})
						.then((devicetoken) => axios.put("/api/profile", { devicetoken }))
						.then(() => (window.localStorage.notifications = "on"))
						.catch((error) => {
							console.log(error);
							App.startIntervalFetch();
						});
					messaging.onMessage((payload) => {
						App.getPosts(true);
						var notification = new Notification(payload.data.title, {
							body: payload.data.body,
							icon: "/icon.png",
						});
						notification.onclick = () => notification.close();
					});
				} else App.startIntervalFetch();
			});
		} else App.startIntervalFetch();
	} catch (e) {
		App.startIntervalFetch();
	}
};

window.addEventListener("online", App.setNetworkStatus);
window.addEventListener("offline", App.setNetworkStatus);
document.addEventListener("visibilitychange", App.setVisibility);
window.onkeydown = (e) => {
	if (e.key === "Escape") {
		if (App.showLogin) App.showLogin = false;
		if (App.showSettings) App.showSettings = false;
	}
};

App.setNetworkStatus();
App.setVisibility();

if ("serviceWorker" in navigator) {
	navigator.serviceWorker.register("/sw.js");
	navigator.serviceWorker.addEventListener("message", () => App.getPosts(true));
}
if (window.localStorage.token) {
	axios.defaults.headers.common["Authorization"] = "TOKEN " + window.localStorage.token;
	App.init();
}
axios.interceptors.response.use(
	(response) => response,
	(error) => {
		if (error.response.status === 401) {
			window.localStorage.token = "";
			window.localStorage.handle = "";
		}
		App.setToast(error.response.data.message || "Something went wrong. Please try again");
		throw error;
	}
);
