process.env.NODE_ENV = "test";
process.env.DATABASE_URL ||= "postgresql://voting:voting@localhost:5432/voting?schema=public";
