// Isolated database + uploads for integration tests (never touches the development data).
process.env.DATABASE_URL = "";
process.env.EMBEDDED_PG_DIR = ".data/postgres-test";
process.env.EMBEDDED_PG_PORT = "5434";
process.env.UPLOAD_DIR = ".data/uploads-test";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "integration-test-password";
process.env.SESSION_TTL_HOURS = "2";
