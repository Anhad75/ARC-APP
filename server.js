/* global process */
import "dotenv/config"
import express from "express"
import cors from "cors"
import { ExpressAuth } from "@auth/express"
import { authConfig, getAuthenticatedUser, getSecurityQuestion, recordsCollection, registerPhoneUser, resetPhonePassword } from "./server/auth.js"

const app = express()
const port = Number(process.env.PORT || 3001)
const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173"
const allowedOrigin = (origin, callback) => {
  const isDevelopmentOrigin = origin && /^https?:\/\/(localhost|127\.0\.0\.1|172\.16\.72\.64|192\.168\.137\.1):517\d+$/.test(origin)
  if (!origin || process.env.NODE_ENV !== "production" || origin === clientOrigin || isDevelopmentOrigin) callback(null, true)
  else callback(new Error("Origin is not allowed"))
}

app.set("trust proxy", true)
app.use(cors({ origin: allowedOrigin, credentials: true }))
app.use(express.json())
app.use("/auth/*", ExpressAuth(authConfig))

app.get("/", (_request, response) => response.redirect(clientOrigin))

app.post("/api/auth/register", async (request, response) => {
  try {
    const user = await registerPhoneUser(request.body || {})
    response.status(201).json({ user })
  } catch (error) {
    response.status(error.message.includes("already exists") ? 409 : 400).json({ error: error.message })
  }
})

app.post("/api/auth/forgot/question", async (request, response) => {
  try {
    response.json({ question: await getSecurityQuestion(request.body?.phone) })
  } catch (error) {
    response.status(400).json({ error: error.message })
  }
})

app.post("/api/auth/forgot/reset", async (request, response) => {
  try {
    await resetPhonePassword(request.body || {})
    response.json({ ok: true })
  } catch (error) {
    response.status(400).json({ error: error.message })
  }
})

async function requireUser(request, response) {
  const user = await getAuthenticatedUser(request)
  if (!user?.id) {
    response.status(401).json({ error: "You must be signed in" })
    return null
  }
  return user
}

app.get("/api/records", async (request, response) => {
  try {
    const user = await requireUser(request, response)
    if (!user) return
    const records = await recordsCollection.find({ ownerId: user.id }).sort({ updatedAt: -1 }).toArray()
    response.json(records.map((record) => {
      const publicRecord = { ...record }
      delete publicRecord._id
      delete publicRecord.ownerId
      return publicRecord
    }))
  } catch (error) {
    response.status(500).json({ error: error.message })
  }
})

app.post("/api/records", async (request, response) => {
  try {
    const user = await requireUser(request, response)
    if (!user) return
    const record = { ...request.body, ownerId: user.id, createdAt: new Date(), updatedAt: new Date() }
    await recordsCollection.insertOne(record)
    response.status(201).json(record)
  } catch (error) {
    response.status(400).json({ error: error.message })
  }
})

app.put("/api/records/:id", async (request, response) => {
  try {
    const user = await requireUser(request, response)
    if (!user) return
    const record = { ...request.body, id: request.params.id, ownerId: user.id, updatedAt: new Date() }
    const result = await recordsCollection.replaceOne({ id: request.params.id, ownerId: user.id }, record)
    if (!result.matchedCount) return response.status(404).json({ error: "Record not found" })
    response.json(record)
  } catch (error) {
    response.status(400).json({ error: error.message })
  }
})

app.delete("/api/records/:id", async (request, response) => {
  try {
    const user = await requireUser(request, response)
    if (!user) return
    const result = await recordsCollection.deleteOne({ id: request.params.id, ownerId: user.id })
    if (!result.deletedCount) return response.status(404).json({ error: "Record not found" })
    response.status(204).end()
  } catch (error) {
    response.status(500).json({ error: error.message })
  }
})

app.get("/api/health", (_request, response) => response.json({ ok: true }))

app.listen(port, () => {
  console.log(`Auth server listening on http://localhost:${port}`)
})
