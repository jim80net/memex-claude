import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadRegistry,
  saveRegistry,
  registerProject,
  getKnownProjects,
  type ProjectRegistry,
} from "../src/core/project-registry.ts";

// Mock homedir so tests don't touch real files
vi.mock("node:os", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:os")>();
  return { ...original, homedir: () => join(tmpdir(), "fake-test-home-registry") };
});

describe("project registry", () => {
  const fakeHome = join(tmpdir(), "fake-test-home-registry");

  beforeEach(async () => {
    await mkdir(join(fakeHome, ".claude", "cache"), { recursive: true });
  });

  afterEach(async () => {
    await rm(fakeHome, { recursive: true, force: true });
  });

  it("returns empty registry when no file exists", async () => {
    const reg = await loadRegistry();
    expect(reg.version).toBe(1);
    expect(reg.projects).toEqual({});
  });

  it("saves and loads registry", async () => {
    const reg = await loadRegistry();
    registerProject(reg, "/home/user/project-a");
    await saveRegistry(reg);

    const loaded = await loadRegistry();
    expect(loaded.projects["/home/user/project-a"]).toBeDefined();
    expect(loaded.projects["/home/user/project-a"].lastSeen).toBeTruthy();
  });

  it("updates lastSeen on re-registration", async () => {
    const reg = await loadRegistry();
    registerProject(reg, "/home/user/project-a");
    const first = reg.projects["/home/user/project-a"].lastSeen;

    registerProject(reg, "/home/user/project-a");
    expect(reg.projects["/home/user/project-a"].lastSeen >= first).toBe(true);
  });

  it("getKnownProjects returns paths sorted by most recent", () => {
    const reg: ProjectRegistry = {
      version: 1,
      projects: {
        "/old": { lastSeen: "2025-01-01T00:00:00Z" },
        "/new": { lastSeen: "2025-06-01T00:00:00Z" },
        "/mid": { lastSeen: "2025-03-01T00:00:00Z" },
      },
    };

    const paths = getKnownProjects(reg);
    expect(paths).toEqual(["/new", "/mid", "/old"]);
  });

  it("getKnownProjects returns empty array for empty registry", () => {
    const reg: ProjectRegistry = { version: 1, projects: {} };
    expect(getKnownProjects(reg)).toEqual([]);
  });
});
