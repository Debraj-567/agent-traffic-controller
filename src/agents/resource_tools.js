export const RESOURCE_TOOLS = [
  {
    type: "function",
    function: {
      name: "request_resource",
      description:
        "Acquire an exclusive shared resource before using it. " +
        "This operation may wait until another agent releases the resource. " +
        "Do not assume acquisition succeeded until this tool returns success.",
      parameters: {
        type: "object",
        properties: {
          resource_id: {
            type: "string",
            description: "Exact resource identifier, such as database or cache."
          }
        },
        required: ["resource_id"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "release_resource",
      description:
        "Release a resource currently owned by this agent after finishing its work.",
      parameters: {
        type: "object",
        properties: {
          resource_id: {
            type: "string",
            description: "Resource identifier to release."
          }
        },
        required: ["resource_id"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_resource_status",
      description:
        "Inspect current resource locks and waiting agents. " +
        "Use this to understand resource contention.",
      parameters: {
        type: "object",
        properties: {},
        additionalProperties: false
      }
    }
  }
];

function validateArguments(args, allowedKeys, requiredKeys = []) {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new Error("Arguments must be an object");
  }

  for (const key of Object.keys(args)) {
    if (!allowedKeys.includes(key)) {
      throw new Error(`Unexpected argument: ${key}`);
    }
  }

  for (const key of requiredKeys) {
    if (!(key in args)) {
      throw new Error(`Missing required argument: ${key}`);
    }
  }
}

function validateResourceId(resourceId) {
  if (
    typeof resourceId !== "string" ||
    resourceId.trim().length === 0 ||
    resourceId.length > 128
  ) {
    throw new Error("Invalid resource_id");
  }

  return resourceId.trim();
}

export async function executeResourceTool(
  name,
  args,
  { agentId, resourceApi }
) {
  if (!agentId || !resourceApi) {
    throw new Error("Agent resource context is missing");
  }

  switch (name) {
    case "request_resource": {
      validateArguments(args, ["resource_id"], ["resource_id"]);

      const resourceId = validateResourceId(args.resource_id);
      const result = await resourceApi.requestResource(resourceId);

      return {
        success: true,
        ...result
      };
    }

    case "release_resource": {
      validateArguments(args, ["resource_id"], ["resource_id"]);

      const resourceId = validateResourceId(args.resource_id);
      const result = await resourceApi.releaseResource(resourceId);

      return {
        success: result.released === true,
        ...result
      };
    }

    case "get_resource_status": {
      validateArguments(args, []);

      return {
        success: true,
        ...resourceApi.getResourceStatus()
      };
    }

    default:
      throw new Error(`Unknown resource tool: ${name}`);
  }
}
