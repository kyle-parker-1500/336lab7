import 'dotenv/config';
import bcrypt from 'bcrypt';
import session from 'express-session';
import express from 'express';
import mysql from 'mysql2/promise';

const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public'));

//for Express to get values using the POST method
app.use(express.urlencoded({extended:true}));

// NEEDED for session variables
app.set('trust proxy', 1);
app.use(session({
   secret: 'keyboard cat',
   resave: false,
   saveUninitialized: true
}))

//setting up database connection pool, replace values in red
const pool = mysql.createPool({
   host: process.env.DB_HOST,
   user: process.env.DB_USERNAME,
   password: process.env.DB_PASSWORD,
   database: process.env.DB_NAME,
   connectionLimit: 10,
   waitForConnections: true
});

//routes
app.get('/', (req, res) => {
   res.render('login.ejs')
});

// login rerewrite
app.post('/login', async (req, res) => {
   let { username, password } = req.body;
   let sql = "", hash = "", user = "";
   
   sql = `SELECT *
          FROM admin
          WHERE username = ?`;
   
   const [ rows ] = await pool.query(sql, [username]);
   if (rows.length > 0) {
      user = rows[0].username;
      hash = rows[0].password;
   }
   
   let match = await bcrypt.compare(password, hash);
   
   if (match) {
      req.session.authenticated = true;
      res.render('welcome.ejs');
   } else {
      res.redirect('/');
   }
});

// handles admin wanting to return to menu
app.get('/home', (req, res) => {
   res.render('home.ejs');
});

// next: the function to execute afterwards
// note, there can be multiple middleware calls between
// the route and the anonymous function
// app.get('/myProfile', f1, f2, f3, function(req, res) => {})
function isAuthenticated(req, res, next) {
   if (!req.session.authenticated) {
      res.redirect('/');
   } else {
      next();
   }
}

// uses session variables && middleware to ensure user is authenticated
app.get('/myProfile', isAuthenticated, (req, res) => {
   res.render('profile.ejs');
});


// logout route
app.get('/logout', isAuthenticated, (req, res) => {
   req.session.destroy(); // deletes current session variables
   res.redirect('/'); // -> go back to login
});

//Gets all quotes from database and display them
app.get('/quotes', async (req, res) => {
   let sql = `SELECT * 
              FROM quotes
				  NATURAL JOIN authors
              ORDER BY quote`;
   const [quotes] = await pool.query(sql);           
   res.render('quotes.ejs', {quotes})
});

// gets all info for a specific quote based on the quoteId
app.get('/updateQuote', isAuthenticated, async(req, res) => {
   let quoteId = req.query.quoteId;
   let sql = `SELECT *
              FROM quotes
              WHERE quoteId = ?`;
   const [quoteInfo] = await pool.query(sql, [quoteId]);              

   let sql2 = `SELECT authorId, firstName, lastName
               FROM authors
               ORDER BY lastName`;
   const [authorList] = await pool.query(sql2);              
   
   let categorySql = `SELECT DISTINCT category
                      FROM quotes`;
   const [categories] = await pool.query(categorySql);
   
   res.render('updateQuote.ejs', {quoteInfo, authorList, categories})
});

// updates the quotes based on admin inputted information
app.post('/updateQuote', isAuthenticated, async (req, res) => {
   let quote = req.body.quote;
   let authorId = req.body.authorId;
   let category = req.body.category;
   let quoteId = req.body.quoteId;
   
   let sql = `UPDATE quotes
              SET 
              quote = ?,
              authorId = ?,
              category = ?
              WHERE quoteId = ?`;
   
   let sqlParams = [quote, authorId, category, quoteId];
   
   const [rows] = await pool.query(sql, sqlParams);

   res.redirect('/quotes');
});

// deleting quote based on quote id
app.get('/deleteQuote', isAuthenticated, async (req, res) => {
   let quoteId = req.query.quoteId;
   
   let sql = `DELETE FROM quotes
              WHERE quoteId = ?`;
   
   const [ rows ] = await pool.query(sql, [quoteId]);
   res.redirect('/quotes');
});


app.get('/authors', isAuthenticated, async (req, res) => {
   let sql = `SELECT *,
				  DATE_FORMAT(dob, '%Y-%m-%d') ISOdob,
				  DATE_FORMAT(dod, '%Y-%m-%d') ISOdod
              FROM authors
              ORDER BY lastName`;
    const [authors] = await pool.query(sql); 
   res.render('authors.ejs', {authors})
});

// rewrite updateAuthor form
app.get('/updateAuthor', isAuthenticated, async (req, res) => {
	let authorId = req.query.authorId;
	let sql = `SELECT *,
				  DATE_FORMAT(dob, '%Y-%m-%d') ISOdob,
				  DATE_FORMAT(dod, '%Y-%m-%d') ISOdod
				  FROM authors
				  WHERE authorId = ?`;
	const [authorInfo] = await pool.query(sql, [authorId]);
	res.render('updateAuthor.ejs', { authorInfo });
});

//Displays the form to update an existing author
/* app.get('/updateAuthor', isAuthenticated, async (req, res) => {
   let authorId = req.query.authorId;
   let sql = `SELECT *, DATE_FORMAT(dob, '%Y-%m-%d') ISOdob, DATE_FORMAT(dod, '%Y-%m-%d') ISOdod
              FROM authors
              WHERE authorId = ?`;
   const [authorInfo] = await pool.query(sql, [authorId]); 
   res.render('updateAuthor.ejs', {authorInfo})
}); */

// rewrite update author
app.post('/updateAuthor', isAuthenticated, async (req, res) => {
	let { firstName, lastName, dob, dod, sex, profession, country, portrait, bio, authorId } = req.body;
	let sql = `UPDATE authors
				  SET firstName = ?,
				  lastName = ?,
				  dob = ?,
				  dod = ?,
				  sex = ?,
				  profession = ?,
				  country = ?,
				  portrait = ?,
				  biography = ?
				  WHERE authorId = ?`;
	let sqlParams = [firstName, lastName, dob || null, dod || null, sex, profession, country, portrait, bio, authorId];
	const [rows] = await pool.query(sql, sqlParams);
	res.redirect('/authors');
});

app.get('/deleteAuthor', isAuthenticated, async (req, res) => {
	let authorId = req.query.authorId;

	let sql = `DELETE FROM authors
				  WHERE authorId = ?`;
	const [rows] = await pool.query(sql, [authorId]);
	res.redirect('/authors');
});

//route to display the form to add a new author
app.get('/addAuthor', isAuthenticated, (req, res) => {
   res.render('addAuthor.ejs');
});

//route to save the author info into the database
app.post('/addAuthor', isAuthenticated, async (req, res) => {

	let { firstName, lastName, dob, dod, sex, profession, country, portrait, bio } = req.body;

	let sql = `INSERT INTO authors
				  (firstName, lastName, dob, dod, sex, profession, country, portrait, biography)
				  VALUES
				  (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
	let sqlParams = [firstName, lastName, dob, dod, sex, profession, country, portrait, bio];

	const [rows] = await pool.query(sql, sqlParams);

   res.redirect('/authors');
});

//route to display the form to add a new quote
app.get('/addQuote', isAuthenticated, async (req, res) => {

   //get list of authors
   let sql = `SELECT *
              FROM authors`;
	const [authors] = await pool.query(sql);
	

   //get list of categories
	let sql2 = `SELECT DISTINCT category
					FROM quotes`;
	
	const [categories] = await pool.query(sql2);
	
   res.render('addQuotes.ejs', { authors, categories });
});

// add quote to db
app.post('/newQuote', async (req, res) => {
	let quote = req.body.quote;
	let category = req.body.category;
	let authorId = req.body.authorId;
	
	let sql = `INSERT INTO quotes (quote, authorId, category)
				  VALUES (?, ?, ?)`;
	
	let sqlParams = [quote, authorId, category];
	
	const [rows] = await pool.query(sql, sqlParams);
	
	res.redirect('/quotes');
});


app.get("/dbTest", async (req, res) => {
   try {
        const [rows] = await pool.query("SELECT CURDATE()");
        res.send(rows);
    } catch (err) {
        console.error("Database error:", err);
        res.status(500).send("Database error!");
    }
});//dbTest
app.listen(3000, ()=>{
    console.log("Express server running")
})
