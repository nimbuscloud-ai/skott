import path from "node:path";

import * as memfs from "memfs";
import { type MinimatchOptions, minimatch } from "minimatch";

import {
  isDirSupportedByDefault,
  isFileSupportedByDefault,
  isManifestFile
} from "../../modules/resolvers/base-resolver.js";
import type { FileReader, FileSystemConfig } from "../file-reader.js";

const minimatchDefaultOptions: MinimatchOptions = {
  dot: true
};

/* eslint-disable no-sync */
export class InMemoryFileReader implements FileReader {
  private cache: Map<string, { modifiedAt: number; content: string }> =
    new Map();

  constructor(
    private readonly config: FileSystemConfig = {
      cwd: "./",
      ignorePatterns: []
    }
  ) {
    this.cache = new Map();
  }

  private isFileIgnored(filename: string): boolean {
    return this.config.ignorePatterns.some((pattern) =>
      minimatch(filename, pattern, minimatchDefaultOptions)
    );
  }

  read(filename: string): Promise<string> {
    if (this.isFileIgnored(filename)) {
      return Promise.reject("_discard_");
    }

    if (this.cache.has(filename)) {
      const { modifiedAt, content } = this.cache.get(filename)!;

      if (memfs.fs.statSync(filename).mtimeMs !== modifiedAt) {
        this.cache.delete(filename);
      } else {
        return Promise.resolve(content);
      }
    }

    return new Promise((resolve) => {
      const content = memfs.fs.readFileSync(filename, "utf-8") as string;
      this.cache.set(filename, {
        modifiedAt: memfs.fs.statSync(filename).mtimeMs,
        content
      });
      resolve(content);
    });
  }

  readSync(filename: string): string {
    return memfs.fs.readFileSync(filename, { encoding: "utf-8" }) as string;
  }

  async *readdir(
    root: string,
    fileExtensions: string[]
  ): AsyncGenerator<string> {
    for (const dirent of memfs.fs.readdirSync(root)) {
      const _dirent = dirent as string;

      if (memfs.fs.lstatSync(path.join(root, _dirent)).isDirectory()) {
        if (isDirSupportedByDefault(path.join(root, _dirent))) {
          yield* this.readdir(path.join(root, _dirent), fileExtensions);
        }
      } else if (
        isManifestFile(_dirent) ||
        (isFileSupportedByDefault(_dirent) &&
          fileExtensions.includes(path.extname(_dirent)) &&
          !this.isFileIgnored(path.join(root, _dirent)))
      ) {
        yield path.join(root, _dirent);
      }
    }
  }

  exists(_filename: string) {
    return Promise.resolve(true);
  }

  stats(_filename: string): Promise<number> {
    return new Promise((resolve) => resolve(0));
  }

  getCurrentWorkingDir(): string {
    return this.config.cwd;
  }
}
