const test = require("node:test"); // Load Node's built-in test runner.
const assert = require("node:assert/strict"); // Load strict assertions for exact checks.
const fs = require("node:fs/promises"); // Read back stored files in a temporary folder.
const os = require("node:os"); // Find the system temporary folder.
const path = require("node:path"); // Build safe file paths.
const { detectImageType, saveImage, MAX_IMAGE_BYTES } = require("../src/services/upload.service"); // Load the upload rules under test.

// Build small byte sequences that start with each real image signature.
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16, 1)]);
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16, 1)]);
const gif = Buffer.concat([Buffer.from("GIF89a", "ascii"), Buffer.alloc(16, 1)]);
const webp = Buffer.concat([Buffer.from("RIFF", "ascii"), Buffer.alloc(4, 0), Buffer.from("WEBP", "ascii"), Buffer.alloc(16, 1)]);

// Create a fresh temporary upload folder for one test.
const createTempDir = () => fs.mkdtemp(path.join(os.tmpdir(), "daily-web-uploads-"));

test("the real image format is detected from the file signature", () => { // Verify the server never trusts the header alone.
  assert.equal(detectImageType(png), "image/png"); // Confirm the PNG signature.
  assert.equal(detectImageType(jpeg), "image/jpeg"); // Confirm the JPEG signature.
  assert.equal(detectImageType(gif), "image/gif"); // Confirm the GIF signature.
  assert.equal(detectImageType(webp), "image/webp"); // Confirm the WebP container signature.
  assert.equal(detectImageType(Buffer.from("<script>alert(1)</script>")), null); // Confirm text content is not an image.
  assert.equal(detectImageType(Buffer.alloc(3)), null); // Confirm tiny buffers are rejected safely.
});

test("a valid image is stored under a random name with the right extension", async (context) => { // Verify the happy path.
  const uploadDir = await createTempDir(); // Write into a throwaway folder instead of the project.
  context.after(() => fs.rm(uploadDir, { recursive: true, force: true })); // Remove the folder after the test.

  const stored = await saveImage({ buffer: png, declaredType: "image/png", uploadDir }); // Store one PNG.

  assert.match(stored.imageUrl, /^\/uploads\/[a-f0-9]{32}\.png$/); // Confirm the public address uses a random name and the PNG extension.
  assert.equal(stored.size, png.length); // Confirm the reported size.
  const written = await fs.readFile(path.join(uploadDir, stored.fileName)); // Read the stored file back.
  assert.ok(written.equals(png)); // Confirm the bytes were written unchanged.
});

test("a file whose content does not match its declared type is rejected", async (context) => { // Verify content sniffing.
  const uploadDir = await createTempDir(); // Use a throwaway folder.
  context.after(() => fs.rm(uploadDir, { recursive: true, force: true })); // Remove it after the test.

  await assert.rejects( // Send PNG bytes while claiming JPEG.
    () => saveImage({ buffer: png, declaredType: "image/jpeg", uploadDir }),
    (error) => error.statusCode === 415
  );
  await assert.rejects( // Send text while claiming PNG.
    () => saveImage({ buffer: Buffer.from("not an image at all"), declaredType: "image/png", uploadDir }),
    (error) => error.statusCode === 415
  );
  assert.deepEqual(await fs.readdir(uploadDir), []); // Confirm nothing was written for rejected uploads.
});

test("unsupported types, empty bodies, and oversized files are rejected", async (context) => { // Verify the remaining guards.
  const uploadDir = await createTempDir(); // Use a throwaway folder.
  context.after(() => fs.rm(uploadDir, { recursive: true, force: true })); // Remove it after the test.

  await assert.rejects(() => saveImage({ buffer: png, declaredType: "image/svg+xml", uploadDir }), (error) => error.statusCode === 415); // Reject SVG because it can carry scripts.
  await assert.rejects(() => saveImage({ buffer: Buffer.alloc(0), declaredType: "image/png", uploadDir }), (error) => error.statusCode === 400); // Reject an empty body.
  await assert.rejects(() => saveImage({ buffer: {}, declaredType: "image/png", uploadDir }), (error) => error.statusCode === 400); // Reject a body that was not parsed as binary.
  const huge = Buffer.concat([png, Buffer.alloc(MAX_IMAGE_BYTES)]); // Build a file just above the limit.
  await assert.rejects(() => saveImage({ buffer: huge, declaredType: "image/png", uploadDir }), (error) => error.statusCode === 413); // Reject files above the limit.
});
