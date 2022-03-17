require("dotenv").config();
const { default: axios } = require("axios");
const https = require("https");
const fs = require("fs");
const express = require("express");
const app = express();
const port = 3000;
const qs = require("qs");
const R = require("ramda");
const path = require("path");
const {
  CLIENT_ID,
  CLIENT_SECRET,
  PGE_API_BASE_URL,
  REDIRECT_BASE_URL,
  SMD_AUTH_BASE_URL,
  PGE_API_BASE_TOKEN_URL
} = process.env;

const xml2js = require("xml2js");

const divideBy = (d) => (n) => n / d;

const daysAgo = (num) =>
  R.compose(Math.floor, divideBy(1000), (today) =>
    new Date(today).setDate(today.getDate() - num)
  )(new Date());

 // assign these parameters from the .env file created from the bash script 
const smdAuthParams = {
  client_id: CLIENT_ID,
  redirect_uri: `${REDIRECT_BASE_URL}/OAuthCallback`,
  response_type: "code",
  login: "guest",
};

const withQuery = (params) => (url) =>
  `${url}${Object.keys(params).length ? "?" : ""}${qs.stringify(params)}`;

const encode64 = (str) => Buffer.from(str, "utf-8").toString("base64");
const decode64 = (str) => Buffer.from(str, "base64").toString("utf-8");

// Base routing of Express to top level URL; when there is GET, it redirects to SMD_AUTH_BASE_URL, the login page for SMD
app.get("/", (req, res) => {
  try{
    const url = withQuery(smdAuthParams)(SMD_AUTH_BASE_URL);
    res.redirect(url);
    //throw new Error("Error Encountered on base URL redirect")
  }
  catch (error){
    next (error)
    console.log("redirect URL is invalid")
    //recover and start again
  }
});

// Overall Try-Catch for application
try {

  
  // Request Tokens from token API endpoint upon a browser 302 to registered callback URL

  app.get("/OAuthCallback", async (req, res, next) => {
    console.log("302 redirect upon authorization by customer")
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Basic ${encode64(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
    };


    const httpsAgent = new https.Agent({
      cert: fs.readFileSync("ssl/certs/certificate.crt"),
      key: fs.readFileSync("ssl/private/private.key"),
    });   

    const data = {
      grant_type: "authorization_code",
      code: req.query.code,
      redirect_uri: `${REDIRECT_BASE_URL}/OAuthCallback`,
    };
    //request for access token using Authcode
    console.log("Authcode is: " + data.code)


    
    const result = await axios.post(
      withQuery(data)(`${PGE_API_BASE_TOKEN_URL}`),
      // get bearer tokens (access token) from token endpoint
      "",
      { httpsAgent, headers }
    );

    console.log("Result Access Token: " + result.data.access_token);

    //request for client_access_token to be used in destroying session
    const clientCredentialsData = {
      grant_type: "client_credentials",
    };

    const clientAccessTokenResponse = await axios.post(
      withQuery(clientCredentialsData)(
        `${PGE_API_BASE_TOKEN_URL}`
      ),
      "",
      { httpsAgent, headers }
     );

    req.data = {
      ...result.data,
      clientAccessToken: clientAccessTokenResponse.data.client_access_token,
    };
    next();
  });

  // Request Data from data access API endpoint using Access Token
  app.get("/OAuthCallback", async (req, res, next) => {
    const accessToken = req.data.access_token;

   const headers = {
      Authorization: `Bearer ${accessToken}`,
    };

    // Mutual Authenticated connection
    const httpsAgent = new https.Agent({
      cert: fs.readFileSync("ssl/certs/certificate.crt"),
      key: fs.readFileSync("ssl/private/private.key"),
    });

    // isolate the subscriptionId value from the returned resourceURI string in data from previous call 
    const subscriptionId = req.data.resourceURI.replace(
      `${PGE_API_BASE_URL}/GreenButtonConnect/espi/1_1/resource/Batch/Subscription/`,
      ""
    );
    // read the UsagePointID (equivalent to SA_UUID) set
    const usagePointIdResponse = await axios.get(
      `${PGE_API_BASE_URL}/GreenButtonConnect/espi/1_1/resource/Subscription/${subscriptionId}/UsagePoint`,
      { httpsAgent, headers }
    );
    // read one UsagePointID based on the string matched "UsagePoint", a ten digit value, and pull first value
    const usagePointId = usagePointIdResponse.data.match(
      /\/UsagePoint\/([0-9]+)/
    )[1];

    // read the Customer Name
    const customerNameResponse = await axios.get(
      `${PGE_API_BASE_URL}/GreenButtonConnect/espi/1_1/resource/Batch/RetailCustomer/${subscriptionId}`,
      { httpsAgent, headers }
    );
    // log the returned value for RetailCustomer API
    console.info('RetailCustomer API returned value: ${customerNameResponse.data}')
    console.info(customerNameResponse.data)
   // extract Customer Name based on the string matched "name" regex /<name>(.+?)<\/name>/
   const customerName = customerNameResponse.data.match(
    /<name>(.+?)<\/name>/
  )[1].replace( /,/g, "" );
    console.info('Name of Customer')
    console.info(customerName)



    // Splitting annual usage request into months

    // First Month
    const fiveDaysAgo = daysAgo(5);
    const thirtyOneDaysAgo = daysAgo(31);
    const firstMonthParams = {
      "published-max": fiveDaysAgo,
      "published-min": thirtyOneDaysAgo,
    };

    // 1st month pull from data API
    const firstMonthEnergyUsageResponse = axios.get(
      withQuery(firstMonthParams)(
        `${PGE_API_BASE_URL}/GreenButtonConnect/espi/1_1/resource/Batch/Subscription/${subscriptionId}/UsagePoint/${usagePointId}`
      ),
      { httpsAgent, headers }
    );

    // Second Month
    const thirtyTwoDaysAgo = daysAgo(32);
    const sixtyTwoDaysAgo = daysAgo(62);
    const secondMonthParams = {
      "published-max": thirtyTwoDaysAgo,
      "published-min": sixtyTwoDaysAgo,
    };

    // 2nd month pull from data API
    const secondMonthEnergyResponse = axios.get(
      withQuery(secondMonthParams)(
        `${PGE_API_BASE_URL}/GreenButtonConnect/espi/1_1/resource/Batch/Subscription/${subscriptionId}/UsagePoint/${usagePointId}`
      ),
      { httpsAgent, headers }
    );

    // Third Month
   const sixtyThreeDaysAgo = daysAgo(63);
   const ninetyThreeDaysAgo = daysAgo(93);
    const thirdMonthParams = {
      "published-max": sixtyThreeDaysAgo,
      "published-min": ninetyThreeDaysAgo,
    };

    // 3rd month pull from data API
    const thirdMonthEnergyResponse = axios.get(
      withQuery(thirdMonthParams)(
        `${PGE_API_BASE_URL}/GreenButtonConnect/espi/1_1/resource/Batch/Subscription/${subscriptionId}/UsagePoint/${usagePointId}`
      ),
      { httpsAgent, headers }
    );

    // Fourth Month
    const ninetyFourDaysAgo = daysAgo(94);
    const oneHundredTwentyFourDaysAgo = daysAgo(124);
    const fourthMonthParams = {
      "published-max": ninetyFourDaysAgo,
      "published-min": oneHundredTwentyFourDaysAgo,
   };

    // 4th month pull from data API
    const fourthMonthEnergyResponse = axios.get(
      withQuery(fourthMonthParams)(
        `${PGE_API_BASE_URL}/GreenButtonConnect/espi/1_1/resource/Batch/Subscription/${subscriptionId}/UsagePoint/${usagePointId}`
      ),
      { httpsAgent, headers }
    );

    // Fifth Month
    const oneHundredTwentyFiveDaysAgo = daysAgo(125);
    const oneHundredFiftyFiveDaysAgo = daysAgo(155);
    const fifthMonthParams = {
      "published-max": oneHundredTwentyFiveDaysAgo,
      "published-min": oneHundredFiftyFiveDaysAgo,
    };

    // 5th month pull from data API
    const fifthMonthEnergyResponse = axios.get(
      withQuery(fifthMonthParams)(
        `${PGE_API_BASE_URL}/GreenButtonConnect/espi/1_1/resource/Batch/Subscription/${subscriptionId}/UsagePoint/${usagePointId}`
      ),
      { httpsAgent, headers }
    );

    // Sixth Month
    const oneHundredFiftySixDaysAgo = daysAgo(156);
    const oneHundredEightySixDaysAgo = daysAgo(186);
    const sixthMonthParams = {
     "published-max": oneHundredFiftySixDaysAgo,
     "published-min": oneHundredEightySixDaysAgo,
    };

    // 6th month pull from data API
    const sixthMonthEnergyResponse = axios.get(
      withQuery(sixthMonthParams)(
        `${PGE_API_BASE_URL}/GreenButtonConnect/espi/1_1/resource/Batch/Subscription/${subscriptionId}/UsagePoint/${usagePointId}`
      ),
      { httpsAgent, headers }
    );

    // Seventh Month
    const oneHundredEightySevenDaysAgo = daysAgo(187);
    const twoHundredSeventeenDaysAgo = daysAgo(217);
    const seventhMonthParams = {
      "published-max": oneHundredEightySevenDaysAgo,
      "published-min": twoHundredSeventeenDaysAgo,
    };

    // 7th month pull from data API
    const seventhMonthEnergyResponse = axios.get(
      withQuery(seventhMonthParams)(
        `${PGE_API_BASE_URL}/GreenButtonConnect/espi/1_1/resource/Batch/Subscription/${subscriptionId}/UsagePoint/${usagePointId}`
      ),
      { httpsAgent, headers }
    );

    // Eigth Month
    const twoHundredEighteenthDaysAgo = daysAgo(218);
    const twoHundredFortyEigthDaysAgo = daysAgo(248);
    const eigthMonthParams = {
      "published-max": twoHundredEighteenthDaysAgo,
      "published-min": twoHundredFortyEigthDaysAgo,
    };

    // 8th month pull from data API
    const eigthMonthEnergyResponse = axios.get(
      withQuery(eigthMonthParams)(
        `${PGE_API_BASE_URL}/GreenButtonConnect/espi/1_1/resource/Batch/Subscription/${subscriptionId}/UsagePoint/${usagePointId}`
      ),
     { httpsAgent, headers }
    );

    // Ninth Month
    const twoHundredFortyNinthDaysAgo = daysAgo(249);
    const twoHundredSeventyNinthDaysAgo = daysAgo(279);
    const ninthMonthParams = {
      "published-max": twoHundredFortyNinthDaysAgo,
      "published-min": twoHundredSeventyNinthDaysAgo,
    };

    // 9th month pull from data API
    const ninthMonthEnergyResponse = axios.get(
     withQuery(ninthMonthParams)(
       `${PGE_API_BASE_URL}/GreenButtonConnect/espi/1_1/resource/Batch/Subscription/${subscriptionId}/UsagePoint/${usagePointId}`
     ),
     { httpsAgent, headers }
   );

    // Tenth Month
    const twoHundredEightiethDaysAgo = daysAgo(280);
    const threeHundredTenthDaysAgo = daysAgo(310);
    const tenthMonthParams = {
      "published-max": twoHundredEightiethDaysAgo,
      "published-min": threeHundredTenthDaysAgo,
    };

    // 10th month pull from data API
    const tenthMonthEnergyResponse = axios.get(
     withQuery(tenthMonthParams)(
       `${PGE_API_BASE_URL}/GreenButtonConnect/espi/1_1/resource/Batch/Subscription/${subscriptionId}/UsagePoint/${usagePointId}`
     ),
     { httpsAgent, headers }
   );

    // Eleventh Month
    const threeHundredEleventhDaysAgo = daysAgo(311);
    const threeHundredFortyFirstDaysAgo = daysAgo(341);
    const eleventhMonthParams = {
      "published-max": threeHundredEleventhDaysAgo,
      "published-min": threeHundredFortyFirstDaysAgo,
    };

    // 11th month pull from data API
    const eleventhMonthEnergyResponse = axios.get(
     withQuery(eleventhMonthParams)(
        `${PGE_API_BASE_URL}/GreenButtonConnect/espi/1_1/resource/Batch/Subscription/${subscriptionId}/UsagePoint/${usagePointId}`
     ),
     { httpsAgent, headers }
    );

    // Twelveth Month
    const threeHundredFortySecondDaysAgo = daysAgo(342);
    const threeHundredSixtyFifthDaysAgo = daysAgo(365);
    const twelvethMonthParams = {
      "published-max": threeHundredFortySecondDaysAgo,
      "published-min": threeHundredSixtyFifthDaysAgo,
    };

    // 12th month pull from data API
    const twelvethMonthEnergyResponse = axios.get(
      withQuery(twelvethMonthParams)(
        `${PGE_API_BASE_URL}/GreenButtonConnect/espi/1_1/resource/Batch/Subscription/${subscriptionId}/UsagePoint/${usagePointId}`
      ),
      { httpsAgent, headers }
    );

    // send request to PG&E's SMD data access API
    Promise.all([
      twelvethMonthEnergyResponse,
     eleventhMonthEnergyResponse,
      tenthMonthEnergyResponse,
      ninthMonthEnergyResponse,
      eigthMonthEnergyResponse,
      seventhMonthEnergyResponse,
      sixthMonthEnergyResponse,
      fifthMonthEnergyResponse,
      fourthMonthEnergyResponse,
      thirdMonthEnergyResponse,
      secondMonthEnergyResponse,
      firstMonthEnergyUsageResponse,
    ]).then((values) => {
      const csvContent = [
       "SA_UUID, Interval Timestamp, Delivered From Grid Value (Wh), Back To Grid Value (Wh)",
      ];
      console.log('xml file values: ' + JSON.stringify(values));
      values.map((value, index) => {
       // convert XML to JSON
       xml2js.parseString(value.data, (err, result) => {
          if (err) {
            throw err;
         }

          const response = result["ns1:feed"]["ns1:entry"].reduce(
            (acc, item, index) => {
              if (
                item["ns1:content"] &&
                item["ns1:content"][0]["ns0:IntervalBlock"]
              ) {
                // retrieves energyFlowIndicator to determine if interval value is DeliveredFromGrid OR BackToGrid
                const energyFlowUrl = item["ns1:link"][0]["$"].href;
                const energyFlowIndicatorString = energyFlowUrl.split("/")[12];
                const firstBufferString = decode64(energyFlowIndicatorString);
                const secondBufferString = decode64(firstBufferString);
                const energyFlowIndicator = R.compose(
                  (arr) => arr[arr.length - 1]
                )(secondBufferString.split(":"));

               const intervalReading = item["ns1:content"][0][
                  "ns0:IntervalBlock"
                ][0]["ns0:IntervalReading"].reduce((accIR, itemIR) => {
                  const itemStartTime =
                    itemIR["ns0:timePeriod"][0]["ns0:start"][0];
                  const itemValue = itemIR["ns0:value"][0];

                  const itemByStartTime = {
                    start: itemStartTime,
                    ...(energyFlowIndicator === "19"
                      ? { generated: itemValue }
                      : { delivered: itemValue }),
                  };

                  return [...accIR, itemByStartTime];
                }, []);
                return [...acc, ...intervalReading];
              }
             return acc;
            },
            []
          );

          const groupedByStart = R.groupBy(({ start }) => start)(response);
          const csvLines = Object.keys(groupedByStart).map((startTime) => {
            const entry = groupedByStart[startTime];
            const newDate = new Date(+startTime * 1000);

           const entryObj = {
              ...entry[0],
              ...entry[1],
            };

            return `${subscriptionId}, ${newDate}, ${
              +entryObj.delivered * 10 ** -3
            }, ${+entryObj.generated * 10 ** -3}`;
          });

          const outputDate = new Date()
            .toISOString()
            .replace(/T/, " ")
            .replace(/\..+/, "");

          if (index === 0) {
            csvContent.push(...csvLines);
            if (!fs.existsSync("output")) fs.mkdirSync("output");
            // name the file to write with customerName and subscriptionID value
            fs.writeFileSync(
              `output/${customerName}-${subscriptionId}-${outputDate}.csv`,
              csvContent.join("\n")
            );  
          } else {
            //creates new line before appending values
            fs.appendFileSync(`output/${customerName}-${subscriptionId}-${outputDate}.csv`, "\n");
            fs.appendFileSync(
              `output/${customerName}-${subscriptionId}-${outputDate}.csv`,
              csvLines.join("\n")
            );
          }
       });
      });
      next();
    });
  });


  // After data is pulled from the SubscriptionID, cancel the Subscription by a DELETE.
  app.use("/OAuthCallback", async (req, res, next) => {
    // For data access client level URI endpoints, the bearer CLIENT ACCESS TOKEN is required
    const clientAccessToken = req.data?.clientAccessToken;
    const authURI = req.data?.authorizationURI;
    const headers = {
      Authorization: `Bearer ${clientAccessToken}`,
    };
    const httpsAgent = new https.Agent({
      cert: fs.readFileSync("ssl/certs/certificate.crt"),
      key: fs.readFileSync("ssl/private/private.key"),
    });
    if (authURI) {
     await axios.delete(authURI, {
       httpsAgent,
        headers,
      });
    }

    // user confirmation page
    res.sendFile(path.join(__dirname, "../public/index.html"));
  });

  app.listen(port, (_) => {
    console.log(`App Listening at http://localhost:${port}`);
  });

} catch (error) {
  console.log(error);
}
