import { stat } from 'node:fs/promises';

export interface ExistingLogFile {
  file: string;
  mtime: Date;
}

/** Finds the most recently written log from a set of optional game-specific locations. */
export async function newestExistingLogFile(files: string[]): Promise<ExistingLogFile | undefined> {
  const candidates = await Promise.all(files.map(async (file) => {
    try {
      return { file, mtime: (await stat(file)).mtime };
    } catch {
      return undefined;
    }
  }));

  return candidates
    .filter((candidate): candidate is ExistingLogFile => candidate !== undefined)
    .toSorted((a, b) => b.mtime.getTime() - a.mtime.getTime())[0];
}
