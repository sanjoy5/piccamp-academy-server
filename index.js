const express = require('express');
const cors = require('cors');
const app = express()
const port = process.env.PORT || 5000
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY)



// middleware 
app.use(cors())
app.use(express.json())

const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorized access' })
    }

    const token = authorization.split(' ')[1]
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: 'unauthorized access' })
        }
        req.decoded = decoded
        next()
    })
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.nuk8vmz.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const usersCollection = client.db('piccampDB').collection('users')
        const classesCollection = client.db('piccampDB').collection('classes')
        const selectedCollection = client.db('piccampDB').collection('selected')
        const paymentsCollection = client.db('piccampDB').collection('payments')

        // make and send token 
        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '10d' })
            res.send({ token })
        })

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            if (user?.role !== 'admin') {
                return res.status(403).send({ error: true, message: 'forbidden access' })
            }
            next()
        }

        const verifyInstructor = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            if (user?.role !== 'instructor') {
                return res.status(403).send({ error: true, message: 'forbidden access' })
            }
            next()
        }


        // Users Collections 



        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray()
            res.send(result)
        })

        app.get('/instructors', async (req, res) => {
            filter = { role: 'instructor' }
            const result = await usersCollection.find(filter).toArray()
            res.send(result);

        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existsUser = await usersCollection.findOne(query)
            if (existsUser) {
                return res.send({ message: 'user alerady exists' })
            }
            const result = await usersCollection.insertOne(user)
            res.send(result)
        })

        app.delete('/deleteuser/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await usersCollection.deleteOne(query)
            res.send(result)
        })

        // Check Admin or not 
        app.get('/users/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email

            if (req.decoded.email !== email) {
                res.send({ admin: false })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query)
            const result = { admin: user?.role === 'admin' }
            res.send(result)
        })

        // Check Instructor or not 
        app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
            const email = req.params.email

            if (req.decoded.email !== email) {
                res.send({ instructor: false })
            }
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            const result = { instructor: user?.role === 'instructor' }
            res.send(result)
        })

        // Check Student or not 
        app.get('/users/student/:email', verifyJWT, async (req, res) => {
            const email = req.params.email

            if (req.decoded.email !== email) {
                res.send({ student: false })
            }
            const query = { email: email }
            const user = await usersCollection.findOne(query)
            const result = { student: user?.role === 'student' }
            res.send(result)
        })

        // Make Admin 
        app.patch('/users/admin/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    role: 'admin'
                },
            }
            const result = await usersCollection.updateOne(filter, updateDoc)
            return res.send(result)
        })

        // Make instructor 
        app.patch('/users/instructor/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    role: 'instructor'
                },
            }
            const result = await usersCollection.updateOne(filter, updateDoc)
            return res.send(result)
        })

        app.get('/allusers', async (req, res) => {
            const result = await usersCollection.find().toArray()
            res.send(result)
        })


        // Classes Collections 

        app.get('/classes', async (req, res) => {
            const cursor = classesCollection.find({ status: "Approve" }).project({ _id: 1, cname: 1, image: 1, iname: 1, email: 1, seats: 1, price: 1, enrolled: 1 });
            const result = await cursor.toArray();
            res.send(result);
        });


        app.get('/popularinstructors', async (req, res) => {
            const pipeline = [
                {
                    $group: {
                        _id: '$email',
                        iname: { $first: '$iname' },
                        iimage: { $first: '$iimage' },
                        email: { $first: '$email' },
                        studentCount: { $sum: '$enrolled' },
                    },
                },
                { $sort: { studentCount: -1 } },
                { $limit: 6 },
            ];

            const instructors = await classesCollection
                .aggregate(pipeline)
                .toArray();

            res.send(instructors);
        })


        app.get('/popularclasses', async (req, res) => {
            const query = { status: "Approve" }
            const options = {
                sort: { enrolled: -1 },
                projection: { _id: 1, cname: 1, image: 1, iname: 1, email: 1, seats: 1, price: 1, enrolled: 1 },
            };

            const result = await classesCollection.find(query, options).limit(6).toArray();
            res.send(result);
        });


        app.get('/instructorclasses', verifyJWT, verifyInstructor, async (req, res) => {
            const email = req.query.email;
            const query = { email: email }
            const result = await classesCollection.find(query).toArray()
            res.send(result)
        })

        app.get('/manageclasses', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await classesCollection.find().toArray()
            res.send(result)
        })

        app.post('/classes', verifyJWT, verifyInstructor, async (req, res) => {
            const newClass = req.body;
            const result = await classesCollection.insertOne(newClass)
            res.send(result)
        })
        app.get('/updateclasses/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await classesCollection.findOne(query)
            // console.log(result);
            res.send(result)
        })

        app.patch('/updateclasses/:id', async (req, res) => {
            const id = req.params.id;
            const body = req.body;
            // console.log(id, body);
            const filter = { _id: new ObjectId(id) }
            const updateClass = {
                $set: {
                    cname: body.cname,
                    image: body.image,
                    iname: body.iname,
                    email: body.email,
                    seats: body.seats,
                    price: body.price,
                }
            }
            const result = await classesCollection.updateOne(filter, updateClass)
            res.send(result)
        })


        app.patch('/approveclass/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    status: 'Approve'
                },
            }
            const result = await classesCollection.updateOne(filter, updateDoc)
            return res.send(result)
        })

        app.patch('/denyclass/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    status: 'Deny'
                },
            }
            const result = await classesCollection.updateOne(filter, updateDoc)
            return res.send(result)
        })

        app.patch('/feedbackclass/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const body = req.body
            // console.log(body);
            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    feedback: body?.feedback
                },
            }
            const result = await classesCollection.updateOne(filter, updateDoc)
            return res.send(result)
        })



        // Selected Collections 

        app.get('/selectedclasses', verifyJWT, async (req, res) => {
            const email = req.query.email
            query = { semail: email }
            const result = await selectedCollection.find(query).toArray()
            res.send(result)
        })

        app.post('/selectedclass', verifyJWT, async (req, res) => {
            const body = req.body;
            // console.log(body);
            const result = await selectedCollection.insertOne(body)
            res.send(result)
        })

        app.delete('/deleteSelectedclass/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await selectedCollection.deleteOne(query)
            res.send(result)
        })


        // create payment intent 
        app.post("/create-payment-intent", verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = parseFloat((price * 100).toFixed(2));
            // Create a PaymentIntent with the order amount and currency
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ['card'],
            });

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });


        // Payment Collection 

        app.get('/enrolled-history', verifyJWT, async (req, res) => {
            const email = req.query.email
            // console.log(email);
            const query = { email: email }
            const result = await paymentsCollection.find(query).sort({ date: -1 }).toArray()
            res.send(result)
        })

        app.post('/payments', verifyJWT, async (req, res) => {
            const payment = req.body;
            // console.log(payment);
            const insertResult = await paymentsCollection.insertOne(payment)
            const deleteQuery = { _id: new ObjectId(payment.selected._id) }
            const deleteResult = await selectedCollection.deleteOne(deleteQuery)
            const updateQuery = { _id: new ObjectId(payment.selected.cId) }
            const updateResult = await classesCollection.updateOne(
                updateQuery,
                {
                    $set: {
                        seats: payment.updatecls.seats > 0 && parseInt(payment.updatecls.seats) - 1,
                        enrolled: payment.updatecls.seats !== 0 && parseInt(payment.updatecls.enrolled) + 1
                    }
                }
            )

            res.send({ insertResult, deleteResult, updateResult })
        })






        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Pic Camp Academy app running...')
})


app.listen(port, () => {
    console.log(`Pic Camp Server is running on Port : ${port}`);
})