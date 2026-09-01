// Load Node's built-in test runner without adding a package.
const test = require("node:test");
// Load strict assertions for exact model validation results.
const assert = require("node:assert/strict");
// Load the User model and its fixed authenticated role list.
const User = require("../src/models/user.model");
// Load the real password helper so test users never use plain text storage.
const { hashPassword } = require("../src/utils/password");

// Build a valid unsaved user without requiring a MongoDB connection.
async function buildUser(overrides = {}) {
  // Hash a sample password using the same secure application helper.
  const passwordHash = await hashPassword("safe-example-password");
  // Return a model document that can be validated in memory.
  return new User({
    // Use a valid normalized username by default.
    username: "reporter.one",
    // Use a readable display name by default.
    displayName: "כתבת בדיקה",
    // Store only the generated password hash.
    passwordHash,
    // Use one allowed authenticated role by default.
    role: "reporter",
    // Allow each test to replace only the field it needs.
    ...overrides
  });
}

// Verify that the database accepts both authenticated team roles.
test("user model accepts reporter and editor roles", async () => {
  // Confirm that the shared list contains exactly the supported roles.
  assert.deepEqual([...User.USER_ROLES], ["reporter", "editor"]);
  // Build one valid reporter document.
  const reporter = await buildUser({ role: "reporter" });
  // Build one valid editor document.
  const editor = await buildUser({ username: "editor.one", role: "editor" });
  // Confirm that reporter validation succeeds without MongoDB.
  await reporter.validate();
  // Confirm that editor validation succeeds without MongoDB.
  await editor.validate();
});

// Verify that guests and invented roles cannot become database users.
test("user model rejects guest and unknown roles", async () => {
  // Build a document that incorrectly tries to store a guest account.
  const guest = await buildUser({ role: "guest" });
  // Confirm that schema validation rejects the guest role.
  await assert.rejects(guest.validate(), /`guest` is not a valid enum value/);
  // Build a document with an invented privileged role.
  const administrator = await buildUser({ role: "admin" });
  // Confirm that schema validation rejects the invented role.
  await assert.rejects(administrator.validate(), /`admin` is not a valid enum value/);
});

// Verify that usernames stay normalized and contain safe characters.
test("user model normalizes and validates usernames", async () => {
  // Build a user with uppercase letters and surrounding spaces.
  const normalizedUser = await buildUser({ username: "  Reporter.Two  " });
  // Validate so Mongoose applies lowercase and trim rules.
  await normalizedUser.validate();
  // Confirm that the saved value would use one predictable form.
  assert.equal(normalizedUser.username, "reporter.two");
  // Build a user whose username contains unsupported spaces.
  const invalidUser = await buildUser({ username: "bad user" });
  // Confirm that schema validation rejects the unsafe username shape.
  await assert.rejects(invalidUser.validate(), /Path `username` is invalid/);
});

// Verify that serialized users never expose their password hashes.
test("user JSON hides the password hash", async () => {
  // Build a valid user containing a real password hash.
  const user = await buildUser();
  // Convert the document through the model's safe JSON method.
  const publicUser = user.toJSON();
  // Confirm that normal public profile data remains available.
  assert.equal(publicUser.username, "reporter.one");
  // Confirm that the password hash is removed from the result.
  assert.equal(Object.hasOwn(publicUser, "passwordHash"), false);
});
