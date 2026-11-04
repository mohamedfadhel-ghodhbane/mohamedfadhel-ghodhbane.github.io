---
title: "Detecting Kerberos attacks in Active Directory: suspicious AS-REQ, Kerberoasting, LDAP reconnaissance and DCSync"
summary: How Kerberos authentication works, and how to investigate suspicious TGT requests, Kerberoasting, LDAP reconnaissance and DCSync with KQL in Microsoft Sentinel and Defender XDR.
type: article
tags: [Active Directory, Kerberos, KQL, Defender for Identity, Sentinel]
status: published
date: 2026-11-04
order: -3
---

## What is Kerberos?

Kerberos is a network authentication protocol that uses secret-key cryptography to give client/server applications strong authentication. In Active Directory, the Key Distribution Centre (KDC) runs on every domain controller. It is the central authentication server: it proves users' identities to services, and services' identities to users.

The KDC has three parts:

- **Authentication Service (AS):** performs the initial authentication and issues the ticket-granting ticket (TGT).
- **Database:** the account database the KDC checks identities against. In a Windows domain, this is Active Directory.
- **Ticket Granting Service (TGS):** issues service tickets for specific services, in exchange for a valid TGT.

An authentication runs in six steps:

1. **AS-REQ:** the client asks the Authentication Service for a TGT. With pre-authentication, which is the default, the request includes a timestamp encrypted with a key derived from the user's password.
2. **AS-REP:** the AS checks the account in Active Directory and returns a TGT, encrypted with the key of the `krbtgt` account, plus a session key encrypted with the user's key.
3. **TGS-REQ:** the client decrypts the session key with its password-derived key. It then sends the TGT, an authenticator (user name and timestamp, encrypted with the session key) and the Service Principal Name (SPN) of the service it wants to the Ticket Granting Service.
4. **TGS-REP:** the TGS checks the TGT and the authenticator, then returns a service ticket encrypted with the service account's key.
5. **AP-REQ:** the client presents the service ticket and a new authenticator to the service.
6. The service decrypts the ticket with its own key, checks the authenticator and grants access.

```text
Client                        KDC (domain controller)              Service
  | -- 1. AS-REQ ------------>  Authentication Service
  | <- 2. AS-REP (TGT) -------
  | -- 3. TGS-REQ (TGT, SPN) ->  Ticket Granting Service
  | <- 4. TGS-REP (service ticket)
  | -- 5. AP-REQ (service ticket) ----------------------------------->  |
  | <- 6. access granted -------------------------------------------  |
```

Each step can be abused. The rest of this article covers four common attacks and how to investigate them.

## Suspicious AS-REQ

An AS-REQ is a request for a TGT. Unusual AS-REQ activity often points to:

- Password spraying or brute-force attempts
- Credential stuffing
- AS-REP roasting, which targets accounts that have Kerberos pre-authentication disabled
- A compromised account getting its first TGT, the first step before attacks like Kerberoasting

### 1. Analyse the source

Start with the requesting device or IP address:

- Is it a known corporate device, or an external IP?
- Is the geolocation expected for this user?

```kql
DeviceNetworkEvents
| where RemoteIP == "<suspicious_IP>"
| where Timestamp between (datetime(<start>) .. datetime(<end>))
| project Timestamp, DeviceName, ActionType, RemoteIP, RemotePort
```

### 2. Examine authentication patterns

Look for anomalies such as:

- A high volume of AS-REQ attempts in a short time
- Many failed attempts followed by a success
- Authentication from unusual locations or devices
- Attempts outside working hours

```kql
IdentityLogonEvents
| where Timestamp > ago(24h)
| where Protocol == "Kerberos"
| where AccountName == "<suspected_account>"
| summarize
    TotalAttempts = count(),
    FailedAttempts = countif(ActionType == "LogonFailed"),
    SuccessfulAttempts = countif(ActionType == "LogonSuccess"),
    UniqueIPs = dcount(IPAddress),
    UniqueDevices = dcount(DeviceName)
    by AccountName, bin(Timestamp, 1h)
```

Password spraying shows the opposite pattern: one source failing against many accounts. On the domain controller side, Event ID 4771 (Kerberos pre-authentication failed) makes this easy to spot in Sentinel. Tune the threshold to your environment:

```kql
SecurityEvent
| where EventID == 4771
| summarize Failures = count(), Accounts = dcount(TargetUserName) by IpAddress, bin(TimeGenerated, 1h)
| where Accounts > 10
```

### 3. Check the account

Confirm the account is legitimate:

- Is it active, and should it be authenticating at all?
- What is its privilege level: standard user or admin?
- When was it created? A newly created account deserves a closer look.
- Was its password or configuration changed recently?

Then look for signs of compromise:

- Concurrent sessions from several locations, or impossible travel
- Access to resources the user doesn't normally touch
- Unusual service ticket requests (TGS-REQ) right after the AS-REQ

### 4. Decide whether the activity is expected

These point to malicious activity:

- Failed attempts across many accounts
- Activity outside the user's usual hours
- A burst of requests in a short time
- Authentication from known malicious IPs
- Service accounts authenticating from user workstations

To finish the investigation, check the other alerts correlated in the same incident, review the user's sign-in logs in Entra ID, and examine the domain controllers' security logs for Event IDs 4768 (TGT requested) and 4771 (pre-authentication failed). This query gives a quick view of what the account did across devices:

```kql
let SuspiciousAccount = "<account_name>";
let TimeWindow = 24h;
union
    (DeviceLogonEvents
    | where Timestamp > ago(TimeWindow)
    | where AccountName == SuspiciousAccount),
    (DeviceFileEvents
    | where Timestamp > ago(TimeWindow)
    | where InitiatingProcessAccountName == SuspiciousAccount),
    (DeviceProcessEvents
    | where Timestamp > ago(TimeWindow)
    | where AccountName == SuspiciousAccount)
| summarize Events = count() by ActionType, DeviceName, bin(Timestamp, 1h)
```

## Kerberoasting

Kerberoasting is a post-exploitation technique against Kerberos. With any valid domain account, even a low-privilege one, the attacker requests service tickets for accounts that have an SPN registered. Those tickets are encrypted with the service account's password hash, so the attacker can take them away and crack the password offline.

### How the attack works

1. **Target identification:** the attacker enumerates Active Directory for user accounts with SPNs. Any authenticated user can read this, and an SPN means the account runs a Kerberos service.
2. **Ticket request:** the attacker requests a service ticket for one or more of those SPNs from the KDC. The KDC doesn't check whether the user is allowed to use the service; it only checks that the user is authenticated and the SPN exists. That design is what makes Kerberoasting possible.
3. **Ticket retrieval:** the domain controller returns the service ticket, encrypted with a key derived from the service account's password.
4. **Offline cracking:** the attacker saves the ticket and cracks it offline, with tools such as Hashcat. How long that takes depends on the password's strength and the encryption type. Attackers often ask for RC4-HMAC on purpose, because it is much faster to crack than AES.
5. **Service account compromise:** once the password is cracked, the attacker can log in as the service account. Service accounts often have broad rights, so this can lead to full domain compromise.

### Indicators

- **Many service tickets from one account:** an unusual number of service ticket requests (Event ID 4769) from a single user, for many different services in a short time.
- **RC4 encryption:** service tickets with encryption type 0x17 (RC4-HMAC). Modern Kerberos defaults to AES (0x11 and 0x12), so an RC4 ticket can mean the attacker asked for a crackable encryption type.
- **Tickets for user-based service accounts:** in Event 4769, the service name is a user account (it doesn't end in `$` and isn't `krbtgt`). These are the accounts Kerberoasting targets, because people set their passwords. Computer account passwords are long and random.
- **No matching access:** service tickets that are requested but never used to log in to the service.

### Detection queries

In Sentinel, depending on your connector, the 4769 fields may not exist as columns, so these queries parse them from the raw event data. Both look only at successful requests for user-based service accounts.

RC4 service tickets:

```kql
SecurityEvent
| where EventID == 4769
| parse EventData with * 'ServiceName">' Service '<' *
| parse EventData with * 'TicketEncryptionType">' EncType '<' *
| parse EventData with * 'Status">' Result '<' *
| where Result == "0x0"
| where EncType == "0x17"   // RC4-HMAC
| where Service !endswith "$" and Service != "krbtgt"
| project TimeGenerated, Computer, TargetUserName, Service, EncType
```

One account requesting tickets for many services in an hour:

```kql
SecurityEvent
| where EventID == 4769
| parse EventData with * 'ServiceName">' Service '<' *
| parse EventData with * 'Status">' Result '<' *
| where Result == "0x0"
| where Service !endswith "$" and Service != "krbtgt"
| summarize Services = dcount(Service), Requests = count(), ServiceList = make_set(Service, 20)
    by TargetUserName, bin(TimeGenerated, 1h)
| where Services > 10   // tune to your environment
```

In Defender XDR, Defender for Identity records Kerberos resource access in `IdentityLogonEvents`. The keys inside `AdditionalFields` vary, so check a sample row before relying on `EncryptionType`:

```kql
IdentityLogonEvents
| where Protocol == "Kerberos"
| where LogonType == "Resource access"
| extend ParsedFields = parse_json(AdditionalFields)
| extend EncryptionType = tostring(ParsedFields.EncryptionType)
| where EncryptionType == "Rc4Hmac"
| summarize
    RequestCount = count(),
    UniqueServices = dcount(DestinationDeviceName),
    Services = make_set(DestinationDeviceName)
    by AccountName, AccountDomain, DeviceName, IPAddress, bin(Timestamp, 1h)
```

## Security principal reconnaissance (LDAP)

Before Kerberoasting or privilege escalation, attackers map the domain with LDAP queries. They look for:

- User accounts with SPNs, the targets for Kerberoasting
- Members of sensitive groups such as Domain Admins, Enterprise Admins and Schema Admins
- Domain configuration, such as domain controllers and Exchange servers
- Account permissions, such as delegation rights and privileges
- Access control lists (ACLs) that show permission relationships between accounts

Defender for Identity logs these queries in `IdentityQueryEvents`. The first query looks for common reconnaissance filters aimed at sensitive targets. Replace `<domain-SID>` with your domain's SID; the `-512` suffix is the Domain Admins group.

```kql
let LDAP_Filter = dynamic([
    "objectGUID=*",
    "(objectClass=*)",
    "(schemaIDGUID=*)",
    "(servicePrincipalName=*)",
    "(samAccountType=805306368)",
    "(&(objectclass=computer)(userAccountControl&8192))",
    "( | (objectClass=user) (objectClass=group) ) (objectSid=<domain-SID>-512) )",
    "objectCategory=CN=Organizational-Unit,CN=Schema,CN=Configuration",
    "(|(samAccountType=805306368)(samAccountType=805306369)(objectclass=organizationalUnit))",
    "(|(samaccounttype=268435456)(samaccounttype=268435457)(samaccounttype=536870912)(samaccounttype=536870913))",
    "(objectCategory=computer)(userAccountControl:1.2.840.113556.1.4.803:=8192)"
]);
let LDAP_Target = dynamic([
    "Domain Admins",
    "Schema Admins",
    "Enterprise Admins",
    "AllDomains",
    "AllTrustDomains",
    "AllSites",
    "AllGroupPolicies"
]);
IdentityQueryEvents
| where Timestamp >= ago(1d)
| where ActionType == "LDAP query"
| where QueryTarget has_any (LDAP_Target)
| where Query has_any (LDAP_Filter)
```

For a wider net, drop the target condition and run the same filter list on its own:

```kql
// paste the LDAP_Filter let statement from the previous query above this line
IdentityQueryEvents
| where Timestamp >= ago(1d)
| where ActionType == "LDAP query"
| where Query has_any (LDAP_Filter)
```

## DCSync

DCSync is a technique where the attacker pretends to be a domain controller and asks a real one to replicate password data. It uses the Directory Replication Service Remote Protocol (MS-DRSR), so the attacker never runs code on the domain controller or touches the `NTDS.dit` file. It abuses the trust between domain controllers, and it maps to MITRE ATT&CK T1003.006.

DCSync needs the "Replicating Directory Changes" and "Replicating Directory Changes All" extended rights on the domain object. Domain Admins, Enterprise Admins and the Administrators group have them by default, so this is a post-exploitation technique that needs elevated privileges first. Common tools are Mimikatz, Impacket and DSInternals, which call the `DsGetNCChanges` function and process the credential data it returns.

### How the attack works

1. **Foothold and privilege escalation:** the attacker compromises an account with replication rights, either a privileged admin account or a service account that was delegated those rights.
2. **Domain controller identification:** the attacker picks any reachable domain controller as the replication source.
3. **Impersonation:** with a command such as `lsadump::dcsync /user:<target_user> /domain:<domain>` in Mimikatz, or Impacket's `secretsdump.py`, the attacker's machine calls `DsGetNCChanges` through the DRSUAPI interface, like a domain controller would.
4. **Credential extraction:** the real domain controller answers with the requested objects, which can be one account or the whole domain. The data includes current and historical NTLM hashes, Kerberos keys and, if reversible encryption is enabled, cleartext passwords.

`secretsdump.py` can also dump the SAM and LSA secrets of a single machine, but that uses a different method (remote registry access with admin rights), not replication.

### What to monitor

Processes:

- `mimikatz.exe`
- Python running Impacket scripts

Network:

- RPC on port 135 and the dynamic range 49152 to 65535, which DRSUAPI uses
- LDAP and LDAPS (389, 636) and the Global Catalog (3268, 3269), which tools often query while preparing the attack

Event IDs:

- **4662:** an operation was performed on an object. It only appears if "Audit Directory Service Access" is enabled and the domain object has an auditing entry for the replication rights.
- **4624:** network logons from the source machine
- **5136:** directory object modifications, for example someone granting replication rights to a new account
- Sysmon process and memory events

In Event 4662, check these fields:

- **SubjectUserName:** for legitimate replication, this is a domain controller's machine account, which ends with `$`.
- **AccessMask:** 0x100, control access, used for explicitly granted extended rights.
- **Properties:** the replication right GUIDs:
  - `1131f6aa-9c07-11d1-f79f-00c04fc2dcd2`: DS-Replication-Get-Changes
  - `1131f6ad-9c07-11d1-f79f-00c04fc2dcd2`: DS-Replication-Get-Changes-All
  - `89e95b76-444d-4c62-991a-0facbeda640c`: DS-Replication-Get-Changes-In-Filtered-Set

### Detection queries

Replication rights used by an account that isn't a domain controller. The `MSOL_` exclusion covers the Entra Connect sync account, which replicates legitimately:

```kql
SecurityEvent
| where EventID == 4662
| where Account !endswith "$"
| where Account !startswith "MSOL_"
| where ObjectServer == "DS"
| where Properties contains "1131f6aa-9c07-11d1-f79f-00c04fc2dcd2"
| project TimeGenerated, EventID, Account, Properties, Computer
```

The same check, covering all three replication rights:

```kql
SecurityEvent
| where EventID == 4662
| where OperationType == "Object Access"
| where AccessMask == "0x100"
| where Properties contains "1131f6aa-9c07-11d1-f79f-00c04fc2dcd2"
    or Properties contains "1131f6ad-9c07-11d1-f79f-00c04fc2dcd2"
    or Properties contains "89e95b76-444d-4c62-991a-0facbeda640c"
| where SubjectUserName !endswith "$"
| where SubjectUserName !startswith "MSOL_"
```

In Defender XDR, Defender for Identity logs replication requests in `IdentityDirectoryEvents`. The action name is case-sensitive:

```kql
IdentityDirectoryEvents
| where ActionType == "Directory Services replication"
| where Protocol == "Drsr"
| where AccountName !endswith "$"
| where AccountName !startswith "MSOL_"
| project Timestamp, DeviceName, AccountName, AccountDomain,
          DestinationDeviceName, Protocol, ActionType, AdditionalFields
| sort by Timestamp desc
```

Replication requested from a machine that isn't one of your domain controllers:

```kql
let DomainControllers = dynamic(["DC01", "DC02"]);   // your domain controllers
IdentityDirectoryEvents
| where ActionType == "Directory Services replication"
| where DeviceName !in~ (DomainControllers)
| project Timestamp, DeviceName, AccountName, DestinationDeviceName, AdditionalFields
```

## Sources

- [Kerberoasting attack detection, prevention and mitigation (InfraSOS)](https://infrasos.com/kerberoasting-attack-detection-prevention-mitigation/)
- [Campfire-1 Sherlock (Hack The Box)](https://app.hackthebox.com/sherlocks/Campfire-1)
- [Hunting for LDAP (eshlomo1, MS-Defender-4-xOPS)](https://github.com/eshlomo1/MS-Defender-4-xOPS/blob/main/MDI/MDI-Hunting/Hunting%20for%20LDAP.kusto)
- [Anomalous LDAP traffic (Bert-JanP, Hunting-Queries-Detection-Rules)](https://github.com/Bert-JanP/Hunting-Queries-Detection-Rules/blob/main/Defender%20For%20Identity/AnomalousLDAPTraffic.md)
- [Detecting DCSync (Black Lantern Security)](https://blog.blacklanternsecurity.com/p/detecting-dcsync)
- [Access rights and access masks (Microsoft Learn)](https://learn.microsoft.com/en-us/windows/win32/secauthz/access-rights-and-access-masks)
