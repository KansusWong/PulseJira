import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DB_DIR = path.resolve(process.cwd(), "database");
const SCHEMA_FILE = path.join(DB_DIR, "schema.sql");
const MIGRATIONS_DIR = path.join(DB_DIR, "migrations");

export async function GET() {
  try {
    const parts: string[] = [];

    // 1. Read base schema
    if (!fs.existsSync(SCHEMA_FILE)) {
      return NextResponse.json(
        { success: false, error: "schema.sql 不存在" },
        { status: 404 }
      );
    }

    parts.push(
      "-- ============================================================"
    );
    parts.push("-- RebuilD: Base Schema (schema.sql)");
    parts.push(
      "-- ============================================================\n"
    );
    parts.push(fs.readFileSync(SCHEMA_FILE, "utf-8").trim());

    // 2. Read migration files, sorted numerically by prefix
    if (fs.existsSync(MIGRATIONS_DIR)) {
      const files = fs
        .readdirSync(MIGRATIONS_DIR)
        .filter((f) => f.endsWith(".sql"))
        .sort((a, b) => {
          const numA = parseInt(a.split("_")[0], 10);
          const numB = parseInt(b.split("_")[0], 10);
          return numA - numB;
        });

      for (const file of files) {
        const content = fs
          .readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8")
          .trim();
        parts.push("");
        parts.push(
          "\n-- ============================================================"
        );
        parts.push(`-- Migration: ${file}`);
        parts.push(
          "-- ============================================================\n"
        );
        parts.push(content);
      }
    }

    const sql = parts.join("\n");
    const totalLines = sql.split("\n").length;
    const fileCount =
      1 +
      (fs.existsSync(MIGRATIONS_DIR)
        ? fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"))
            .length
        : 0);

    return NextResponse.json({
      success: true,
      data: { sql, fileCount, totalLines },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
