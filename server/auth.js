/* global process */
import "dotenv/config"
import bcrypt from "bcryptjs"
import { randomUUID } from "node:crypto"
import { MongoClient } from "mongodb"
import Credentials from "@auth/express/providers/credentials"

if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required")
if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
  throw new Error("AUTH_SECRET must be at least 32 characters")
}

const mongoClient = new MongoClient(process.env.MONGODB_URI)
const database = mongoClient.db(process.env.MONGODB_DB || "field-notes")
const phoneUsers = database.collection("phoneUsers")
export const recordsCollection = database.collection("records")

export function normalizePhone(phone) {
  const value = String(phone || "").replace(/[\s()-]/g, "")
  if (/^\d{10}$/.test(value)) return `+91${value}`
  if (/^91\d{10}$/.test(value)) return `+${value}`
  if (/^\+\d{8,15}$/.test(value)) return value
  return null
}

export async function registerPhoneUser({ phone, password, securityQuestion, securityAnswer }) {
  const normalizedPhone = normalizePhone(phone)
  if (!normalizedPhone || !password || password.length < 8) throw new Error("Enter a valid mobile number and a password with at least 8 characters")
  if (!securityQuestion?.trim() || !securityAnswer?.trim()) throw new Error("Security question and answer are required")
  const existing = await phoneUsers.findOne({ phone: normalizedPhone })
  if (existing?.passwordHash) throw new Error("An account with this mobile number already exists")
  const user = {
    userId: existing?.userId || `phone-${randomUUID()}`,
    phone: normalizedPhone,
    name: normalizedPhone,
    passwordHash: await bcrypt.hash(password, 12),
    securityQuestion: securityQuestion.trim(),
    securityAnswerHash: await bcrypt.hash(securityAnswer.trim().toLowerCase(), 12),
    sessionVersion: existing?.sessionVersion || 1,
    createdAt: existing?.createdAt || new Date(),
  }
  if (existing) await phoneUsers.replaceOne({ userId: existing.userId }, user)
  else await phoneUsers.insertOne(user)
  return { id: user.userId, phone: user.phone, name: user.name }
}

export async function getSecurityQuestion(phone) {
  const normalizedPhone = normalizePhone(phone)
  if (!normalizedPhone) throw new Error("Enter a valid mobile number")
  const user = await phoneUsers.findOne({ phone: normalizedPhone }, { projection: { securityQuestion: 1 } })
  if (!user?.securityQuestion) throw new Error("No security question is set for this mobile number")
  return user.securityQuestion
}

export async function resetPhonePassword({ phone, securityAnswer, password }) {
  const normalizedPhone = normalizePhone(phone)
  if (!normalizedPhone || !securityAnswer?.trim() || !password || password.length < 8) throw new Error("Provide your security answer and a password with at least 8 characters")
  const user = await phoneUsers.findOne({ phone: normalizedPhone })
  if (!user?.securityAnswerHash || !(await bcrypt.compare(securityAnswer.trim().toLowerCase(), user.securityAnswerHash))) throw new Error("Security answer is incorrect")
  await phoneUsers.updateOne({ userId: user.userId }, { $set: { passwordHash: await bcrypt.hash(password, 12) }, $inc: { sessionVersion: 1 } })
}

export const authConfig = {
  trustHost: true,
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt", maxAge: 25 * 24 * 60 * 60 },
  providers: [
    Credentials({
      name: "Mobile password",
      credentials: {
        phone: { label: "Mobile number", type: "tel" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const phone = normalizePhone(credentials?.phone)
        const password = String(credentials?.password || "")
        if (!phone || !password) return null
        const user = await phoneUsers.findOne({ phone })
        if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) return null
        await phoneUsers.updateOne({ userId: user.userId }, { $inc: { sessionVersion: 1 } })
        const updatedUser = await phoneUsers.findOne({ userId: user.userId })
        return { id: updatedUser.userId, phone: updatedUser.phone, name: updatedUser.name, sessionVersion: updatedUser.sessionVersion }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.phone = user.phone
        token.sessionVersion = user.sessionVersion
      }
      if (token.sub) {
        const currentUser = await phoneUsers.findOne({ userId: token.sub }, { projection: { sessionVersion: 1 } })
        if (!currentUser || currentUser.sessionVersion !== token.sessionVersion) return null
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub
        session.user.phone = token.phone
      }
      return session
    },
  },
}

export async function getAuthenticatedUser(request) {
  const { getSession } = await import("@auth/express")
  const session = await getSession(request, authConfig)
  return session?.user || null
}

