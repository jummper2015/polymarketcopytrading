/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@libsql/client"],
};

const withNextIntl = require("next-intl/plugin")();
module.exports = withNextIntl(nextConfig);
