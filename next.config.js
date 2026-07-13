/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3"],
};

const withNextIntl = require("next-intl/plugin")();
module.exports = withNextIntl(nextConfig);
