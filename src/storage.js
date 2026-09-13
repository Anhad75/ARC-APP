import Dexie from "dexie";

export const fieldNotesDb = new Dexie("field-notes");

fieldNotesDb.version(1).stores({
  records: "id, updatedAt, synced",
  paths: "id, updatedAt",
  users: "phone",
});

export async function getLocalUser(phone) {
  return fieldNotesDb.users.get(phone);
}

export async function saveLocalUser(user) {
  await fieldNotesDb.users.put(user);
}

export async function loadLocalRecords() {
  return fieldNotesDb.records.toArray();
}

export async function saveLocalRecords(records) {
  await fieldNotesDb.transaction("rw", fieldNotesDb.records, async () => {
    await fieldNotesDb.records.clear();
    await fieldNotesDb.records.bulkPut(records);
  });
}

export async function saveLocalRecord(record) {
  await fieldNotesDb.records.put(record);
}

export async function removeLocalRecord(recordId) {
  await fieldNotesDb.records.delete(recordId);
}

export async function loadLocalPath() {
  const saved = await fieldNotesDb.paths.get("current");
  return saved?.points || [];
}

export async function saveLocalPath(points) {
  await fieldNotesDb.paths.put({ id: "current", points, updatedAt: new Date() });
}

