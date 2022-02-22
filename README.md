# ShareMyData Client Web Application Data Download (SCWADD)
This repository contains an implementation of a model NodeJS application that interacts with PG&E's ShareMyData (SMD) platform, to facilitate download of a PG&E customer user energy data from the utility's data access API service.  The data access is done in the role of a third party data access client, and PG&E is acting as the data custodian for the customer, also referred to as the user.

## Basic Features of SCWADD

- SCWADD leverages the "Click-Through" workflow of PG&E's SMD platform, i.e. its OAuth2-based code grant flow for authorization of customer owned data access, with PG&E acting as the data custodian.

- SCWADD first directs user to PG&E's authentication page for SMD, at sharemydata.pge.com/myAuthorazation, so that a user may give data access permission (authorization) for a pre-configured and registered third-party (data access client registered at sharemydata.pge.com/#login).

- Upon completion of data access authorization, i.e. user authorizes, and SCWADD completes the OAuth2 authorization code grant flow and acquires the bearer tokens, SCWADD commences electrical energy usage data pull for 12 months of data.

- SCWADD then deletes the data access authorization by the user

- In the end of the tranaction, SCWADD generates a CSV file for download directly from separately accessible directory

- The user energy usage data is accessible by a username/password access to the {Configured SCWADD URL}/output directory

## Quick Start
The following prerequisite conditions are assumed:
- Amazon AWS is the installation account.
- Registration with PG&E's SMD service as a third party, at https://sharemydata.pge.com/#login
- Edit scwadd-ec2-launch-user-data.txt
- Rename file to scwadd-ec2-lauch-user-data.bash

Given that the above conditions have been met, SCWADD is run by initiating an EC2 instance on AWS, and copying the public IPv4 URL to the third party portal page, under third party redirect URL of https://sharemydata.pge.com/#login, under managing registration page.

#### Steps to configure AWS EC2 instance for SCWADD

- Launch instance of EC2, and select the first "Amazon Linux 2 AMI, 64-bit (x86), "Free Tier Eligible" version.

- Select t2.micro, Free tier eligible, from the list of t2 instances.

- Go to "Configure Instance Details" and scroll down to "Advanced Details".

- For "User data", select "As file" and choose your locally stored and edited (Edit of the content is explained in separate section) *scwadd-ec2-launch-user-data.bash file*.

- Accept as default for configuration until "Configure Security Group".  Add ports 80 (http) & 443 (https). If desired, add 22 (ssh) but know that you will be required to have an ssh key set up with AWS in the region that runs your instance of EC2.

- Review and Launch.  If ssh is selected, you will be prompted to select the key-value pair for the shared key between AWS and your local environment.

When an EC2 instance is run, it takes some minutes for the Status check of the EC2 instance to pass all its checks; the Public IPv4 DNS value will be populated and should look something like "ec2-ip1-ip2-ip3-ip4-us-{region}-n.compute.amazonaws.com", where IPv4 address is "ip1.ip2.ip3.ip4".  Copy this onto your clipboard.

In the manage registration dashboard of sharemydata.pge.com/#login, paste the Public IPv4 DNS with "/OAuthCallback" appended, in the third party redirect URL field.  This will register the callback of ShareMyData to your instance of EC2 running SCWADD.

The secure directory http://ec2-ip1-ip2-ip3-ip4-us-{region}-n.compute.amazonaws.com/output will contain the customer authorized data, accessible by the preconfigured username and password for the directory access from the bash file.

## Configuring the BASH file
As explained above in the **Quick Start**, the *BASH* script file is very important to autoconfigure the EC2 instance and get SCWADD running. There are specific items in the model *BASH* file that need to be specified by you.

CLIENT ID: value obtained from SMD third party portal registration management page
- CLIENT_ID=*insert value here*

CLIENT SECRET: value obtained from SMD third party portal registration management page
- CLIENT_SECRET=*insert value here*

CERTIFICATE value from SSL
- echo "*insert value here*" >> /prod-scwadd/ssl/certs/certificate.crt

PRIVATE KEY value from SSL
- echo "*insert value here*" >> /prod-scwadd/ssl/private/private.key

USERNAME/PASSWORD for Data Access directory:  insert username:{SHA}<encoded value> between the "" below, where username is some string value, and <encoded value> is given by using a tool such as from https://hostingcanada.org/htpasswd-generator/ to help create the encoding
- echo "*insert value here*" >> /prod-scwadd/nginx/conf/auth/htpasswd