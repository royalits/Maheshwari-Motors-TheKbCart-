import "dotenv/config.js";
import http from "http";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function testAPI() {
  await sleep(2000); // Wait for server to start

  console.log("Testing API endpoints...\n");

  const options = {
    hostname: "localhost",
    port: 8080,
    path: "/api/v1/users/login",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  };

  // Login first
  const loginPayload = JSON.stringify({
    email: "firmadmin@gmail.com",
    password: "Firm@1234",
  });

  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", async () => {
        try {
          const response = JSON.parse(data);
          const token = response.data?.token;
          console.log(`✓ Logged in. Token: ${token?.substring(0, 20)}...\n`);

          // Test party endpoint
          const partyOptions = {
            hostname: "localhost",
            port: 8080,
            path: "/api/v1/bills/next-number?contact_type=party&is_gst=1",
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          };

          const partyReq = http.request(partyOptions, (res) => {
            let partyData = "";
            res.on("data", (chunk) => {
              partyData += chunk;
            });
            res.on("end", async () => {
              try {
                const partyResponse = JSON.parse(partyData);
                console.log("Party (contact_type=party):");
                console.log(`  Bill No: ${partyResponse.data?.bill_no}`);
                console.log(`  Sequence: ${partyResponse.data?.sequence}\n`);

                // Test supplier endpoint
                const supplierOptions = {
                  hostname: "localhost",
                  port: 8080,
                  path: "/api/v1/bills/next-number?contact_type=supplier&is_gst=1",
                  method: "GET",
                  headers: {
                    Authorization: `Bearer ${token}`,
                  },
                };

                const supplierReq = http.request(supplierOptions, (res) => {
                  let supplierData = "";
                  res.on("data", (chunk) => {
                    supplierData += chunk;
                  });
                  res.on("end", async () => {
                    try {
                      const supplierResponse = JSON.parse(supplierData);
                      console.log("Supplier (contact_type=supplier):");
                      console.log(
                        `  Bill No: ${supplierResponse.data?.bill_no}`,
                      );
                      console.log(
                        `  Sequence: ${supplierResponse.data?.sequence}\n`,
                      );

                      // Test book endpoint
                      const bookOptions = {
                        hostname: "localhost",
                        port: 8080,
                        path: "/api/v1/bills/next-number?contact_type=book&is_gst=1",
                        method: "GET",
                        headers: {
                          Authorization: `Bearer ${token}`,
                        },
                      };

                      const bookReq = http.request(bookOptions, (res) => {
                        let bookData = "";
                        res.on("data", (chunk) => {
                          bookData += chunk;
                        });
                        res.on("end", () => {
                          try {
                            const bookResponse = JSON.parse(bookData);
                            console.log("Book (contact_type=book):");
                            console.log(
                              `  Bill No: ${bookResponse.data?.bill_no}`,
                            );
                            console.log(
                              `  Sequence: ${bookResponse.data?.sequence}`,
                            );
                            console.log("\n=== TEST COMPLETE ===");
                            resolve();
                          } catch (e) {
                            console.error(
                              "Error parsing book response:",
                              e.message,
                            );
                            resolve();
                          }
                        });
                      });
                      bookReq.on("error", (e) => {
                        console.error("Book request error:", e);
                        resolve();
                      });
                      bookReq.end();
                    } catch (e) {
                      console.error(
                        "Error parsing supplier response:",
                        e.message,
                      );
                      resolve();
                    }
                  });
                });
                supplierReq.on("error", (e) => {
                  console.error("Supplier request error:", e);
                  resolve();
                });
                supplierReq.end();
              } catch (e) {
                console.error("Error parsing party response:", e.message);
                resolve();
              }
            });
          });
          partyReq.on("error", (e) => {
            console.error("Party request error:", e);
            resolve();
          });
          partyReq.end();
        } catch (e) {
          console.error("Error parsing login response:", e.message);
          resolve();
        }
      });
    });

    req.on("error", (e) => {
      console.error("Login request error:", e);
      resolve();
    });

    req.write(loginPayload);
    req.end();
  });
}

testAPI().then(() => process.exit(0));
