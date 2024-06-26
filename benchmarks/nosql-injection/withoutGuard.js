const measure = require("./measure");
const getUser = require("./getUser");
const getClient = require("./getClient");

async function main() {
  const client = await getClient();
  const timings = await measure(async () => {
    await getUser(client, {
      email: "email",
      password: "password",
    });
  });

  await client.close();

  console.log(JSON.stringify(timings));
}

main();
