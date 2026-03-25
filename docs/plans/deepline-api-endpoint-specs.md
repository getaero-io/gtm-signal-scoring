# Deepline API Endpoint Specs — Required for GTM Signal Scoring

These endpoints must exist on the Deepline gateway (`POST https://code.deepline.com/api/v2/integrations/execute`) for the gtm-signal-scoring app to function. Each is called with `{ provider, operation, payload }`.

---

## Existing Endpoints (confirmed working)

| Provider | Operation | Purpose |
|----------|-----------|---------|
| `apify` | `scrape_website` | Website content scraping for qualification |
| `attio` | `upsert_person` | Create/update Attio person record |
| `attio` | `upsert_company` | Create/update Attio company record |
| `attio` | `update_record` | Update an existing Attio record |
| `attio` | `search_records` | Search Attio records |
| `lemlist` | `send_email` | Send email via Lemlist (used by QStash delayed send) |

---

## New Endpoints Required

### HubSpot Provider (`provider: "hubspot"`)

#### `search_contacts`
Search HubSpot contacts by filter criteria.
```json
{
  "provider": "hubspot",
  "operation": "search_contacts",
  "payload": {
    "filterGroups": [
      {
        "filters": [
          { "propertyName": "email", "operator": "EQ", "value": "user@example.com" }
        ]
      }
    ],
    "properties": ["email", "firstname", "lastname"]
  }
}
```
**Expected response:** `{ "result": { "results": [{ "id": "123", "properties": { ... } }] } }`

**Deepline implementation:** Proxy to `POST https://api.hubapi.com/crm/v3/objects/contacts/search` with `Authorization: Bearer ${HUBSPOT_ACCESS_TOKEN}`

---

#### `create_contact`
Create a new HubSpot contact.
```json
{
  "provider": "hubspot",
  "operation": "create_contact",
  "payload": {
    "properties": {
      "email": "user@example.com",
      "firstname": "John",
      "lastname": "Doe",
      "company": "Acme Inc"
    }
  }
}
```
**Expected response:** `{ "result": { "id": "456" } }`

**Deepline implementation:** Proxy to `POST https://api.hubapi.com/crm/v3/objects/contacts`

---

#### `update_contact`
Update an existing HubSpot contact's properties.
```json
{
  "provider": "hubspot",
  "operation": "update_contact",
  "payload": {
    "contactId": "123",
    "properties": { "hs_lead_status": "QUALIFIED" }
  }
}
```
**Expected response:** `{ "result": { "id": "123" } }`

**Deepline implementation:** Proxy to `PATCH https://api.hubapi.com/crm/v3/objects/contacts/{contactId}`

---

#### `create_deal`
Create a HubSpot deal with contact/company associations.
```json
{
  "provider": "hubspot",
  "operation": "create_deal",
  "payload": {
    "properties": {
      "dealname": "Acme Inc — Inbound Qualified",
      "pipeline": "default",
      "dealstage": "qualifiedtobuy",
      "hubspot_owner_id": "789",
      "gtm_qualification_score": "85"
    },
    "associations": [
      {
        "to": { "id": "123" },
        "types": [{ "associationCategory": "HUBSPOT_DEFINED", "associationTypeId": 3 }]
      }
    ]
  }
}
```
**Expected response:** `{ "result": { "id": "deal-001" } }`

**Deepline implementation:** Proxy to `POST https://api.hubapi.com/crm/v3/objects/deals`

---

#### `list_owners`
List HubSpot owners, optionally filtered by email.
```json
{
  "provider": "hubspot",
  "operation": "list_owners",
  "payload": {
    "email": "rep@company.com",
    "limit": 1
  }
}
```
**Expected response:** `{ "result": { "results": [{ "id": "owner-001" }] } }`

**Deepline implementation:** Proxy to `GET https://api.hubapi.com/crm/v3/owners?email={email}&limit={limit}`

---

#### `search_companies`
Search HubSpot companies by filter criteria.
```json
{
  "provider": "hubspot",
  "operation": "search_companies",
  "payload": {
    "filterGroups": [
      {
        "filters": [
          { "propertyName": "domain", "operator": "EQ", "value": "acme.com" }
        ]
      }
    ],
    "limit": 1
  }
}
```
**Expected response:** `{ "result": { "results": [{ "id": "comp-001", "properties": { ... } }] } }`

**Deepline implementation:** Proxy to `POST https://api.hubapi.com/crm/v3/objects/companies/search`

---

#### `create_company`
Create a new HubSpot company.
```json
{
  "provider": "hubspot",
  "operation": "create_company",
  "payload": {
    "properties": {
      "domain": "acme.com",
      "name": "Acme Inc"
    }
  }
}
```
**Expected response:** `{ "result": { "id": "comp-002" } }`

**Deepline implementation:** Proxy to `POST https://api.hubapi.com/crm/v3/objects/companies`

---

### Vector Provider (`provider: "vector"`)

#### `company_lookup`
Look up company firmographic data from Vector.co by domain.
```json
{
  "provider": "vector",
  "operation": "company_lookup",
  "payload": {
    "domain": "acme.com"
  }
}
```
**Expected response:**
```json
{
  "result": {
    "name": "Acme Inc",
    "domain": "acme.com",
    "industry": "Consumer Packaged Goods",
    "sub_industry": "Food & Beverage",
    "employee_count": 25,
    "revenue_range": "$1M-$5M",
    "founded_year": 2019,
    "funding_total": 2000000,
    "funding_stage": "Seed",
    "technologies": ["Shopify", "Klaviyo"],
    "description": "...",
    "headquarters": { "city": "Los Angeles", "state": "CA", "country": "US" },
    "social_profiles": { "linkedin": "https://linkedin.com/company/acme" }
  }
}
```

**Deepline implementation:** Proxy to `GET https://api.vector.co/v1/companies/lookup?domain={domain}` with `Authorization: Bearer ${VECTOR_API_KEY}`

---

### Lemlist Provider — New Endpoints (`provider: "lemlist"`)

#### `get_activities`
Get activities (replies, opens, clicks, etc.) with full content. This is the primary way to pull reply text for LLM drafting and analytics.
```json
{
  "provider": "lemlist",
  "operation": "lemlist_get_activities",
  "payload": {
    "type": "emailsReplied",
    "limit": 100,
    "offset": 0,
    "campaignId": "cam_abc123"
  }
}
```
**Supported types:** `emailsReplied`, `linkedinReplied`, `emailsSent`, `emailsOpened`, `emailsClicked`, `linkedinSent`

**Expected response:**
```json
{
  "result": [
    {
      "_id": "act_xxx",
      "type": "linkedinReplied",
      "text": "Hey, sounds interesting! Tell me more about the waterfall enrichment.",
      "messagePreview": "Hey, sounds interesting!",
      "leadFirstName": "John",
      "leadLastName": "Doe",
      "leadEmail": "john@acme.com",
      "sendUserName": "Jai Toor",
      "campaignName": "GTM Engineering Copy",
      "campaignId": "cam_abc123",
      "sequenceStep": 2,
      "isFirst": true,
      "stopped": true,
      "aiLeadInterestScore": 0.667,
      "createdAt": "2026-03-25T20:55:49.877Z",
      "jobTitle": "Head of Growth",
      "companyDomain": "acme.com",
      "latest_org": "Acme Inc"
    }
  ]
}
```

**Key fields for reply processing:**
- `text` — Full reply content (LinkedIn). This is the actual message text.
- `messagePreview` — Truncated reply preview (Email). Often only contains first few words.
- `aiLeadInterestScore` — Lemlist's AI-scored interest level (0-1). Useful for prioritization.
- `sendUserName` — The rep who sent the original message (maps to Jai/Chirag/Saf).
- `sequenceStep` — Which step in the sequence triggered the reply.

**Deepline implementation:** Proxy to `GET https://api.lemlist.com/api/activities?type={type}&limit={limit}&offset={offset}&campaignId={campaignId}` with Basic Auth (empty username, API key as password: `-u ":${LEMLIST_API_KEY}"`).

**Important auth note:** Lemlist uses HTTP Basic Auth, NOT `X-Api-Key` header. The API key goes as the password with an empty username.

---

#### `list_campaigns`
List all campaigns.
```json
{
  "provider": "lemlist",
  "operation": "lemlist_list_campaigns",
  "payload": {}
}
```
**Expected response:** `{ "result": [{ "_id": "cam_abc", "name": "Campaign Name", "labels": [...] }] }`

**Deepline implementation:** Proxy to `GET https://api.lemlist.com/api/campaigns` with Basic Auth.

---

#### `get_lead_activity`
Get all activities for a specific lead (full conversation thread).
```json
{
  "provider": "lemlist",
  "operation": "lemlist_get_lead_activity",
  "payload": {
    "leadId": "lea_abc123"
  }
}
```
**Expected response:** `{ "result": [{ "_id": "act_xxx", "type": "linkedinReplied", "text": "...", ... }] }`

**Deepline implementation:** Proxy to `GET https://api.lemlist.com/api/activities?leadId={leadId}&limit=50` with Basic Auth.

---

### SmartLead Provider — New Endpoints (`provider: "smartlead"`)

#### `get_activities`
Get campaign activities with reply content.
```json
{
  "provider": "smartlead",
  "operation": "smartlead_get_activities",
  "payload": {
    "campaignId": "123",
    "type": "replied",
    "limit": 100,
    "offset": 0
  }
}
```
**Deepline implementation:** Proxy to SmartLead's campaign leads API with status filter.

---

### HeyReach Provider — New Endpoints (`provider: "heyreach"`)

#### `get_activities`
Get campaign activities with reply content.
```json
{
  "provider": "heyreach",
  "operation": "heyreach_get_activities",
  "payload": {
    "campaignId": "123",
    "type": "replied",
    "limit": 100,
    "offset": 0
  }
}
```
**Deepline implementation:** Proxy to HeyReach's campaign activity API.

---

## Summary of New Endpoints

| Provider | Operation | Upstream API |
|----------|-----------|-------------|
| `hubspot` | `search_contacts` | `POST /crm/v3/objects/contacts/search` |
| `hubspot` | `create_contact` | `POST /crm/v3/objects/contacts` |
| `hubspot` | `update_contact` | `PATCH /crm/v3/objects/contacts/{id}` |
| `hubspot` | `create_deal` | `POST /crm/v3/objects/deals` |
| `hubspot` | `list_owners` | `GET /crm/v3/owners` |
| `hubspot` | `search_companies` | `POST /crm/v3/objects/companies/search` |
| `hubspot` | `create_company` | `POST /crm/v3/objects/companies` |
| `vector` | `company_lookup` | `GET /v1/companies/lookup` |
| `lemlist` | `get_activities` | `GET /api/activities?type={type}` |
| `lemlist` | `list_campaigns` | `GET /api/campaigns` |
| `lemlist` | `get_lead_activity` | `GET /api/activities?leadId={id}` |
| `smartlead` | `get_activities` | SmartLead campaign leads API |
| `heyreach` | `get_activities` | HeyReach campaign activity API |

All endpoints follow the standard Deepline gateway pattern:
- Auth: `Authorization: Bearer ${DEEPLINE_API_KEY}`
- Request: `{ provider, operation, payload }`
- Response: `{ result: T }`
