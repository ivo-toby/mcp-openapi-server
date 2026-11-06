# Change: Add server instructions

## Why

The MCP protocol lets a server describe itself to the client: `InitializeResult.instructions` carries free text that a client "MAY add to the system prompt", so that the model learns how the server is meant to be used. The SDK accepts it through `ServerOptions.instructions`, but this library never fills it in, so every server built with it answers the `initialize` request without instructions.

That text is the only place where the conventions of an API fit: what has to be called before what, what the service does with what it receives. An OpenAPI description doesn't say those things, and repeating them in every tool description is both noisy and unreliable.

## What Changes

- Add an `instructions` configuration option, handed to the MCP client in the `initialize` result
- Accept it from the command line and from the environment, as the other options are

## Impact

- Affected specs: `server-instructions`
- Affected code: `src/config.ts`, `src/server.ts`, tests, `README.md`
