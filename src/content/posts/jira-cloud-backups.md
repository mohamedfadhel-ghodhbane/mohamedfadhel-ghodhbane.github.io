---
title: "Automating Jira Cloud backups: what still works"
summary: Jira Cloud still has no free scheduled backups, and the backup API that most scripts relied on was retired in 2026. The options left, from Atlassian's paid add-on to Marketplace apps and exporting your own data through the REST API.
type: writeup
tags: [Jira, Backup, Atlassian, Automation]
status: published
date: 2026-11-11
order: -4
---

## The problem

Jira Cloud on the Free and Standard plans has no scheduled backups. An admin can create a site backup by hand in the Backup Manager, but only once every 48 hours, and someone has to remember to do it and download the file. Atlassian's ticket for automatic backups, [CLOUD-6498](https://jira.atlassian.com/browse/CLOUD-6498), was opened in 2013 and has more than 2,000 votes. As of November 2026 its status is "Waiting for Release", which Atlassian's tracker describes as a fix that is implemented and waiting to ship. No release date is given, so check the ticket before you build or buy a workaround: native scheduling may make some of the options below unnecessary.

For a long time the answer was a script. Atlassian Labs published PowerShell and Bash scripts that called the Backup Manager API with an admin's API token, and people ran them every 48 hours from a server's scheduled task or cron job. A variant ran the same script as an AWS Lambda or Azure Function and pushed the file to an S3 bucket, a Google Cloud Storage bucket or Azure Blob Storage, so no server was needed.

## What changed in 2026

Atlassian told customers that from 30 March 2026 it would deprecate the Backup Manager API endpoints those scripts depend on, including `/rest/backup/1/export/runbackup`. Users reported their scheduled backups failing from April 2026 onwards, and issues about it were opened on popular backup script projects.

If you still run one of these scripts, check its logs and the backup folder now. A backup script that fails without alerting anyone is worse than no script, because everyone assumes the backups exist.

## Options that work now

### 1. Atlassian Backup and Restore

Atlassian's own answer is Backup and Restore, a paid add-on for Jira Cloud on the Premium and Enterprise plans. It runs backups on demand or on a daily or weekly schedule, keeps them in Atlassian-owned storage for 30 days, and restores from the admin console. Storing backups in your own Amazon S3 bucket is no longer offered, except to customers who already used it.

This is the simplest option if you are already on one of those plans, but the backups stay with Atlassian, which matters if your recovery plan assumes a copy outside the vendor.

### 2. Marketplace backup apps

Apps on the Atlassian Marketplace, such as Revyz and Rewind, schedule backups for you and many add item-level restore, so you can bring back a single deleted issue or project instead of a whole site. They work on plans where Atlassian's add-on is not available.

They cost a subscription, and the vendor holds a full copy of your Jira data. Before choosing one, review its security documentation and certifications, where it stores data, and who on your side can trigger a restore.

### 3. Export your own data through the REST API

Jira's supported REST API can still read everything a script needs to keep its own copy of your work: a scheduled job pages through issues with a JQL search, saves them as JSON, and downloads their attachments to storage you control. It can run where the old scripts did, as a scheduled task, a cron job, or a Lambda or Azure Function writing to cloud storage.

This is an export, not a site backup: it keeps your issues, comments and attachments, but you cannot restore a whole site from it. It fits best as a second copy alongside one of the options above, or as a record you must keep for compliance.

## Which one to choose

| Situation | Best fit |
| --- | --- |
| Premium or Enterprise plan, backups can stay with Atlassian | Atlassian Backup and Restore |
| Standard plan, or you need item-level restore | A Marketplace backup app |
| You need a copy in your own storage | REST API export, alongside one of the above |

## Security notes

Whichever option you pick, the backup holds everything in your Jira, so treat it like production data:

- Keep API tokens out of scripts. Store them in a secret store such as Azure Key Vault or AWS Secrets Manager, and give the job an account with only the access it needs.
- Restrict who can read the backup storage, and encrypt it at rest.
- Alert on failed backups, so a broken job gets noticed the day it breaks.
- Test a restore regularly. A backup you have never restored is a hope, not a plan.

## Sources

- [CLOUD-6498: Automatic backup generation in Backup Manager (Atlassian)](https://jira.atlassian.com/browse/CLOUD-6498)
- [Overview of Atlassian Backup and Restore (Atlassian Support)](https://support.atlassian.com/organization-administration/docs/overview-of-atlassian-backups/)
- [Backup Manager API deprecation: is there going to be a replacement? (Atlassian Community)](https://community.atlassian.com/forums/Jira-questions/Backup-Manager-API-deprecation-is-there-going-to-be-a/qaq-p/3120079)
- [Backup Manager API deprecation (datreeio/jira-backup-py, GitHub issue)](https://github.com/datreeio/jira-backup-py/issues/27)
- [Rewind Backups for Jira (Atlassian Marketplace)](https://marketplace.atlassian.com/apps/1226389/rewind-backups-for-jira)
- [Revyz Backup for Jira (Revyz)](https://revyz.io/products/backup)
- [automatic-cloud-backup scripts (Atlassian Labs, Bitbucket)](https://bitbucket.org/atlassianlabs/automatic-cloud-backup/src/master/)
- [IP addresses and domains for Atlassian cloud products (Atlassian Support)](https://support.atlassian.com/organization-administration/docs/ip-addresses-and-domains-for-atlassian-cloud-products/#Outgoing-Connections)
