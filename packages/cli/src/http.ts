import { writeFile } from "node:fs/promises";
import * as path from "node:path";
import type { AbbyConfig, PullAbbyConfigResponse } from "@tryabby/core";
import chalk from "chalk";
import fetch from "node-fetch";
import { ABBY_BASE_URL } from "./consts";
import { multiLineLog } from "./util";

export function validateSafeFlagRemovalPath(
  candidatePath: string,
  workspaceRoot: string,
  allowedPaths: Set<string>
): string {
  if (
    typeof candidatePath !== "string" ||
    candidatePath.trim().length === 0 ||
    candidatePath.includes("\0")
  ) {
    throw new Error("Invalid file path in server response");
  }
  const resolvedRoot = path.resolve(workspaceRoot);
  const resolvedTarget = path.resolve(resolvedRoot, candidatePath);
  const isInsideWorkspace =
    resolvedTarget === resolvedRoot ||
    resolvedTarget.startsWith(resolvedRoot + path.sep);

  if (!isInsideWorkspace || !allowedPaths.has(resolvedTarget)) {
    throw new Error(
      `Security error: refusing to overwrite unauthorized path outside requested file set: ${candidatePath}`
    );
  }
  return resolvedTarget;
}

export abstract class HttpService {
  static async getConfigFromServer({
    projectId,
    apiKey,
    apiUrl,
  }: {
    projectId: string;
    apiKey: string;
    apiUrl?: string;
  }) {
    const url = apiUrl ?? ABBY_BASE_URL;

    const response = await fetch(`${url}/api/v1/config/${projectId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error("Invalid response from server");
    }

    const responseJson = await response.json();
    return responseJson as PullAbbyConfigResponse;
  }

  static async updateConfigOnServer({
    apiKey,
    localAbbyConfig,
    apiUrl,
  }: {
    apiKey: string;
    localAbbyConfig: AbbyConfig;
    apiUrl?: string;
  }) {
    const url = apiUrl ?? ABBY_BASE_URL;

    try {
      const response = await fetch(
        `${url}/api/v1/config/${localAbbyConfig.projectId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(localAbbyConfig),
        }
      );

      const status = response.status;

      if (status === 200) {
        console.log(chalk.green("Config was pushed successfully"));
      } else if (status === 500) {
        throw new Error("Internal server error while pushing config");
      } else if (status === 401) {
        throw new Error("Invalid API Key");
      } else {
        throw new Error("Push failed");
      }
    } catch (e) {
      console.log(chalk.red(multiLineLog(`Error: ${e}`)));
      throw e;
    }
  }

  static async getFilesWithFlagsRemoved({
    apiKey,
    files,
    flagName,
    apiUrl,
    workspaceRoot,
  }: {
    apiKey: string;
    files: Array<{ filePath: string; fileContent: string }>;
    flagName: string;
    apiUrl?: string;
    workspaceRoot?: string;
  }) {
    const url = apiUrl ?? ABBY_BASE_URL;
    const baseRoot = path.resolve(workspaceRoot ?? process.cwd());
    const allowedPaths = new Set(
      files.map((f) => path.resolve(baseRoot, f.filePath))
    );

    try {
      const response = await fetch(`${url}/api/ee/v1/abby-ai/flag-removal`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          flagName,
          files,
        }),
      });

      const status = response.status;

      if (status === 200) {
        const res = await response.json();
        if (!Array.isArray(res)) {
          throw new Error("Invalid response from server");
        }
        await Promise.all(
          res.map((file) => {
            if (!file || typeof file.fileContent !== "string") {
              throw new Error("Invalid file entry in server response");
            }
            const safePath = validateSafeFlagRemovalPath(
              file.filePath,
              baseRoot,
              allowedPaths
            );
            return writeFile(safePath, file.fileContent);
          })
        );
      } else if (status === 500) {
        throw new Error("Internal server error trying to update files");
      } else if (status === 401) {
        throw new Error("Invalid API Key");
      } else {
        throw new Error("Unable to update files");
      }
    } catch (e) {
      console.log(chalk.red(multiLineLog(`Error: ${e}`)));
      throw e;
    }
  }
}
