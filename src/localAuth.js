import bcrypt from "bcryptjs";
import { getLocalUser, saveLocalUser } from "./storage.js";

const SESSION_KEY = "field-notes-local-session";
const SESSION_MAX_AGE = 25 * 24 * 60 * 60 * 1000;

export function normalizePhone(phone) {
  const value = String(phone || "").replace(/[\s()-]/g, "");
  if (/^\d{10}$/.test(value)) return `+91${value}`;
  if (/^91\d{10}$/.test(value)) return `+${value}`;
  if (/^\+\d{8,15}$/.test(value)) return value;
  return null;
}

export async function registerLocalUser({ phone, password, securityQuestion, securityAnswer }) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone || password.length < 8) throw new Error("Enter a valid mobile number and a password with at least 8 characters");
  if (!securityQuestion.trim() || !securityAnswer.trim()) throw new Error("Security question and answer are required");
  if (await getLocalUser(normalizedPhone)) throw new Error("An account with this mobile number already exists");
  const user = {
    phone: normalizedPhone,
    name: normalizedPhone,
    passwordHash: await bcrypt.hash(password, 10),
    securityQuestion: securityQuestion.trim(),
    securityAnswerHash: await bcrypt.hash(securityAnswer.trim().toLowerCase(), 10),
    sessionVersion: 1,
    createdAt: new Date(),
  };
  await saveLocalUser(user);
  return user;
}

export async function signInLocalUser(phone, password) {
  const normalizedPhone = normalizePhone(phone);
  const user = normalizedPhone ? await getLocalUser(normalizedPhone) : null;
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new Error("Sign-in failed. Check your mobile number and password.");
  const updatedUser = { ...user, sessionVersion: (user.sessionVersion || 0) + 1 };
  await saveLocalUser(updatedUser);
  saveLocalSession(updatedUser);
  return updatedUser;
}

export async function getLocalSecurityQuestion(phone) {
  const normalizedPhone = normalizePhone(phone);
  const user = normalizedPhone ? await getLocalUser(normalizedPhone) : null;
  if (!user?.securityQuestion) throw new Error("No security question is set for this mobile number");
  return user.securityQuestion;
}

export async function resetLocalPassword({ phone, securityAnswer, password }) {
  const normalizedPhone = normalizePhone(phone);
  const user = normalizedPhone ? await getLocalUser(normalizedPhone) : null;
  if (!user || !(await bcrypt.compare(securityAnswer.trim().toLowerCase(), user.securityAnswerHash))) throw new Error("Security answer is incorrect");
  const updatedUser = { ...user, passwordHash: await bcrypt.hash(password, 10), sessionVersion: (user.sessionVersion || 0) + 1 };
  await saveLocalUser(updatedUser);
}

export function getLocalSession() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (!session || Date.now() - session.createdAt > SESSION_MAX_AGE) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session.user;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function saveLocalSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ user: { id: user.phone, phone: user.phone, name: user.name }, createdAt: Date.now() }));
}

export function clearLocalSession() {
  localStorage.removeItem(SESSION_KEY);
}
