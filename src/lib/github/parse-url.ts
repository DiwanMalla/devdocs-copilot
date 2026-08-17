export type GitHubRepoRef = {
  owner: string;
  name: string;
};

const OWNER_REPO = /^[A-Za-z0-9_.-]+$/;

export function parseGitHubRepoInput(input: string): GitHubRepoRef {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Enter a public GitHub repository URL or owner/name.");
  }

  let owner: string | undefined;
  let name: string | undefined;

  const ownerRepoMatch = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/?#]+)\/([^/?#]+)(?:[/?#].*)?$/i,
  );

  if (ownerRepoMatch) {
    owner = ownerRepoMatch[1];
    name = ownerRepoMatch[2];
  } else {
    const parts = trimmed.replace(/^\/+|\/+$/g, "").split("/");
    if (parts.length === 2) {
      owner = parts[0];
      name = parts[1];
    }
  }

  if (!owner || !name) {
    throw new Error(
      "Could not parse that repository. Use https://github.com/owner/repo or owner/repo.",
    );
  }

  name = name.replace(/\.git$/i, "");

  if (!OWNER_REPO.test(owner) || !OWNER_REPO.test(name)) {
    throw new Error("Repository owner or name contains invalid characters.");
  }

  if (owner === "." || owner === ".." || name === "." || name === "..") {
    throw new Error("Invalid repository owner or name.");
  }

  return { owner, name };
}
