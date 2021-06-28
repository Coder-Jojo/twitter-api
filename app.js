const express = require("express");
const app = express();
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbpath = path.join(__dirname, "twitterClone.db");

app.use(express.json());

let db = null;

const createServer = async () => {
  try {
    db = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    });
    app.listen(3000);
  } catch (e) {
    console.log(e);
  }
};

createServer();

app.post("/register/", async (req, res) => {
  const { username, password, name, gender } = req.body;
  const existQuery = `
        select * from user
        where username = '${username}'
    `;
  const userExist = await db.get(existQuery);
  if (userExist !== undefined) {
    res.status(400).send("User already exists");
  } else {
    if (password.length < 6) {
      res.status(400).send("Password is too short");
    } else {
      const hashedPass = await bcrypt.hash(password, 10);
      const addQuery = `
            insert into user
            (username, password, name, gender)
            values
            ('${username}', '${hashedPass}', '${name}', '${gender}')
          `;
      const resp = await db.run(addQuery);
      console.log(resp);
      res.send("User created successfully");
    }
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const findQuery = `
        select * from user
        where username = '${username}'
    `;
  const userPresent = await db.get(findQuery);
  if (userPresent === undefined) {
    res.status(400).send("Invalid user");
  } else {
    const isCorrectPass = await bcrypt.compare(password, userPresent.password);
    if (isCorrectPass) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "jojo");
      res.send({ jwtToken });
    } else {
      res.status(400).send("Invalid password");
    }
  }
});

const authenticate = async (req, res, next) => {
  let jwtToken;
  const auth = req.headers["authorization"];
  if (auth === undefined) {
    res.status(401).send("Invalid JWT Token");
  } else {
    jwtToken = auth.split(" ")[1];
    if (jwtToken === undefined) {
      res.status(401).send("Invalid JWT Token");
    } else {
      jwt.verify(jwtToken, "jojo", async (error, payload) => {
        if (error) {
          res.status(401).send("Invalid JWT Token");
        } else {
          req.username = payload.username;
          next();
        }
      });
    }
  }
};

app.use(authenticate);

app.get("/user/tweets/feed", async (req, res) => {
  const username = req.username;
  const getUser = `
        select user_id from user
        where username = '${username}'
    `;
  const user = await db.get(getUser);
  const userId = user.user_id;
  const getTweet = `
        select username,
        tweet, date_time as dateTime
        from tweet join user
        on tweet.user_id = user.user_id
        join follower 
        on follower.following_user_id = user.user_id
        where tweet.user_id in (
            select following_user_id
            from follower
            where follower_user_id = ${userId}
        )
        group by tweet.tweet_id
        order by date_time desc
        limit 4
    `;
  const resp = await db.all(getTweet);
  console.log(resp);
  res.send(resp);
});

app.get("/user/followers", async (req, res) => {
  //   console.log(username);
  const username = req.username;
  const getFollower = `
        select name
        from user join follower 
        on user.user_id = follower.follower_user_id
        where follower.following_user_id = (
            select user_id
            from user
            where username = '${username}'
        )
    `;
  const resp = await db.all(getFollower);
  console.log(resp);
  res.send(resp);
});

app.get("/user/following", async (req, res) => {
  const username = req.username;
  const getFollowing = `
        select name
        from user join follower
        on user.user_id = follower.following_user_id
        where follower.follower_user_id = (
            select user_id
            from user
            where username = '${username}'
        )
    `;
  const resp = await db.all(getFollowing);
  console.log(resp);
  res.send(resp);
});

app.get("/tweets/:tweetId", async (req, res) => {
  const { tweetId } = req.params;
  const username = req.username;
  const getUser = `
        select user_id from user
        where username = '${username}'
    `;
  const user = await db.get(getUser);

  const getTweetUser = `
    select user_id from tweet
    where tweet_id = ${tweetId}
  `;
  const tweetUser = await db.get(getTweetUser);

  const userId = user.user_id;
  const tweetUserId = tweetUser.user_id;

  const followerQuery = `
    select * from follower
    where follower_user_id = ${userId} 
    and following_user_id = ${tweetUserId}
  `;
  const isFollower = await db.get(followerQuery);

  if (isFollower === undefined) {
    res.status(401).send("Invalid Request");
  } else {
    const query = `
        select tweet,
        count(distinct like_id) as likes,
        count(distinct reply_id) as replies,
        tweet.date_time as dateTime
        from tweet
        join reply
        on reply.tweet_id = tweet.tweet_id
        join like
        on like.tweet_id = tweet.tweet_id
        where tweet.tweet_id = ${tweetId}
    `;
    const resp = await db.get(query);

    res.send(resp);
  }
});

app.get("/tweets/:tweetId/likes", async (req, res) => {
  const { tweetId } = req.params;
  const username = req.username;
  const getUser = `
        select user_id from user
        where username = '${username}'
    `;
  const user = await db.get(getUser);

  const getTweetUser = `
    select user_id from tweet
    where tweet_id = ${tweetId}
  `;
  const tweetUser = await db.get(getTweetUser);

  const userId = user.user_id;
  const tweetUserId = tweetUser.user_id;

  const followerQuery = `
    select * from follower
    where follower_user_id = ${userId} 
    and following_user_id = ${tweetUserId}
  `;
  const isFollower = await db.get(followerQuery);

  if (isFollower === undefined) {
    res.status(401).send("Invalid Request");
  } else {
    const query = `
        select username
        from user
        join like
        on user.user_id = like.user_id
        where tweet_id = ${tweetId}
    `;
    const resp = await db.all(query);
    const ansArray = resp.map((ele) => {
      return ele.username;
    });
    res.send({ likes: ansArray });
  }
});

app.get("/tweets/:tweetId/replies", async (req, res) => {
  const { tweetId } = req.params;
  const username = req.username;
  const getUser = `
        select user_id from user
        where username = '${username}'
    `;
  const user = await db.get(getUser);

  const getTweetUser = `
    select user_id from tweet
    where tweet_id = ${tweetId}
  `;
  const tweetUser = await db.get(getTweetUser);

  const userId = user.user_id;
  const tweetUserId = tweetUser.user_id;

  const followerQuery = `
    select * from follower
    where follower_user_id = ${userId} 
    and following_user_id = ${tweetUserId}
  `;
  const isFollower = await db.get(followerQuery);

  if (isFollower === undefined) {
    res.status(401).send("Invalid Request");
  } else {
    const query = `
        select name, reply
        from user
        join reply
        on user.user_id = reply.user_id
        where tweet_id = ${tweetId}
    `;
    const resp = await db.all(query);

    res.send({ replies: resp });
  }
});

app.get("/user/tweets", async (req, res) => {
  const username = req.username;
  const getUser = `
        select user_id from user
        where username = '${username}'
    `;
  const user = await db.get(getUser);
  const userId = user.user_id;
  //   const userId = 5;
  const query = `
    select tweet,
        count(distinct like_id) as likes,
        count(distinct reply_id) as replies,
        tweet.date_time as dateTime
        from tweet
        join reply
        on reply.tweet_id = tweet.tweet_id
        join like
        on like.tweet_id = tweet.tweet_id
        where tweet.user_id = ${userId}
        group by tweet.tweet_id
  `;
  const resp = await db.all(query);
  res.send(resp);
});

app.post("/user/tweets", async (req, res) => {
  const username = req.username;
  const getUser = `
        select user_id from user
        where username = '${username}'
    `;
  const user = await db.get(getUser);
  const userId = user.user_id;

  const { tweet } = req.body;
  const date = new Date();
  let dateTime = "";
  let year = date.getFullYear();
  let month = date.getMonth() + 1;
  let day = date.getDate();
  let hour = date.getHours();
  let minute = date.getMinutes();
  let seconds = date.getSeconds();
  dateTime +=
    year.toString() +
    "-" +
    (month < 10 ? "0" : "") +
    month.toString() +
    "-" +
    (day < 10 ? "0" : "") +
    day.toString() +
    " ";

  dateTime +=
    (hour < 10 ? "0" : "") +
    hour.toString() +
    ":" +
    (minute < 10 ? "0" : "") +
    minute.toString() +
    ":" +
    (seconds < 10 ? "0" : "") +
    seconds.toString();

  console.log(dateTime);

  const query = `
      insert into tweet
      (tweet, user_id, date_time)
      values
      ('${tweet}', ${userId}, ${dateTime.slice(0, 10)})
    `;
  console.log(query);
  const resp = await db.run(query);
  console.log(resp);
  res.send("Created a Tweet");
});

app.delete("/tweets/:tweetId", async (req, res) => {
  const { tweetId } = req.params;
  const username = req.username;
  const getUser = `
        select user_id from user
        where username = '${username}'
    `;
  const user = await db.get(getUser);
  const userId = user.user_id;

  const getTweetId = `
    select user_id from tweet 
    where tweet_id = ${tweetId}
  `;
  const tweet = await db.get(getTweetId);
  const tweetUserId = tweet.user_id;
  console.log({ tweetUserId, userId });

  if (tweetUserId !== userId) {
    res.status(401).send("Invalid Request");
  } else {
    const delTweet = `
        delete from tweet
        where tweet_id = ${tweetId}
      `;
    const resp = db.run(delTweet);
    console.log(resp);
    res.send("Tweet Removed");
  }
});

module.exports = app;
