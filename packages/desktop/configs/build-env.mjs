const isDev = process.env.BUILD_ENV === "dev";

export { isDev };
export const deeplinkScheme = isDev ? "neovate-dev" : "neovate";
