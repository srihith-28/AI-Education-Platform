import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import { MongoClient } from "mongodb";

import type { AssignmentRecord } from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "classwork-assignments.json");

type AssignmentCollection = {
  assignments: AssignmentRecord[];
};

declare global {
  // eslint-disable-next-line no-var
  var __classworkMongoClientPromise: Promise<MongoClient> | undefined;
}

const mongoUri = process.env.MONGODB_URI;
const mongoDbName = process.env.MONGODB_DB_NAME || "teacher_classwork";

const normalizeAssignments = (records: AssignmentRecord[]): AssignmentRecord[] => {
  return records
    .map((record) => ({
      ...record,
      id: record.id || randomUUID(),
      title: record.title || "Untitled",
      description: record.description || "",
      type: record.type || "assignment",
      points: Number.isFinite(record.points) ? record.points : 100,
      dueDate: record.dueDate || null,
      topic: record.topic || "No topic",
      attachments: Array.isArray(record.attachments) ? record.attachments : [],
      quizQuestions: Array.isArray(record.quizQuestions) ? record.quizQuestions : [],
      createdAt: record.createdAt || new Date().toISOString(),
      className: record.className || "Class A",
      status: record.status || "published",
      scheduledFor: record.scheduledFor || null,
      updatedAt: record.updatedAt || new Date().toISOString(),
    }))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
};

const ensureDataFile = async (): Promise<void> => {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    const initial: AssignmentCollection = { assignments: [] };
    await fs.writeFile(DATA_FILE, JSON.stringify(initial, null, 2), "utf-8");
  }
};

const readFromFile = async (): Promise<AssignmentRecord[]> => {
  await ensureDataFile();
  const content = await fs.readFile(DATA_FILE, "utf-8");
  const parsed = JSON.parse(content) as AssignmentCollection;
  return normalizeAssignments(parsed.assignments || []);
};

const writeToFile = async (assignments: AssignmentRecord[]): Promise<void> => {
  await ensureDataFile();
  const payload: AssignmentCollection = { assignments: normalizeAssignments(assignments) };
  await fs.writeFile(DATA_FILE, JSON.stringify(payload, null, 2), "utf-8");
};

const getMongoClient = (): Promise<MongoClient> => {
  if (!mongoUri) {
    throw new Error("MONGODB_URI is not configured");
  }
  if (!global.__classworkMongoClientPromise) {
    const client = new MongoClient(mongoUri);
    global.__classworkMongoClientPromise = client.connect();
  }
  return global.__classworkMongoClientPromise;
};

const readFromMongo = async (): Promise<AssignmentRecord[]> => {
  const client = await getMongoClient();
  const db = client.db(mongoDbName);
  const docs = await db
    .collection<AssignmentRecord>("assignments")
    .find({})
    .sort({ createdAt: -1 })
    .toArray();

  return normalizeAssignments(
    docs.map((doc) => {
      const { _id, ...rest } = doc as AssignmentRecord & { _id?: unknown };
      return rest;
    }),
  );
};

const writeToMongo = async (assignments: AssignmentRecord[]): Promise<void> => {
  const client = await getMongoClient();
  const db = client.db(mongoDbName);
  const collection = db.collection<AssignmentRecord>("assignments");
  await collection.deleteMany({});
  if (assignments.length > 0) {
    await collection.insertMany(assignments);
  }
};

export const readAssignments = async (): Promise<AssignmentRecord[]> => {
  if (mongoUri) {
    try {
      return await readFromMongo();
    } catch {
      return readFromFile();
    }
  }
  return readFromFile();
};

export const writeAssignments = async (assignments: AssignmentRecord[]): Promise<void> => {
  if (mongoUri) {
    try {
      await writeToMongo(assignments);
      return;
    } catch {
      await writeToFile(assignments);
      return;
    }
  }
  await writeToFile(assignments);
};
