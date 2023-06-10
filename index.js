const express = require('express');
const cors = require('cors');
const app = express()
const port = process.env.PORT || 5000
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');


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
        await client.connect();

        const usersCollection = client.db('piccampDB').collection('users')
        const classesCollection = client.db('piccampDB').collection('classes')

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


        // Classes Collections 

        app.get('/classes', async (req, res) => {
            const result = await classesCollection.find().toArray()
            res.send(result)
        })

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