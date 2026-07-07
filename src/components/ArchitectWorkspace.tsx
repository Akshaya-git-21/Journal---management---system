import { useState } from 'react';
import { Database, GitFork, ArrowRightLeft, FileCode, Check, Copy } from 'lucide-react';

export default function ArchitectWorkspace() {
  const [activeSubTab, setActiveSubTab] = useState<'DATABASE' | 'STATE_MACHINE' | 'REST_API' | 'CONTROLLERS'>('DATABASE');
  const [copiedText, setCopiedText] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  const postgresDDL = `
-- ====================================================================
-- PostgreSQL RDBMS DDL: JOURNAL MANAGEMENT SYSTEM ENTERPRISE SUBSTRATE
-- ====================================================================

-- 1. Roles Definition Enum
CREATE TYPE platform_role AS ENUM ('AUTHOR', 'EDITOR', 'REVIEWER', 'PUBLISHER');

-- 2. Manuscripts Lifecycles Enum
CREATE TYPE manuscript_status AS ENUM (
  'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'AWAITING_DECISION', 'ACCEPTED', 'PUBLISHED', 'REJECTED'
);

-- 3. Reviewer Milestones Enum
CREATE TYPE review_status AS ENUM (
  'INVITED', 'ACCEPTED', 'SUBMITTED', 'DECLINED'
);

-- 4. Users Domain Table
CREATE TABLE users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  affiliation VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Manuscripts Primary Table
CREATE TABLE manuscripts (
  id VARCHAR(64) PRIMARY KEY,
  title TEXT NOT NULL,
  abstract TEXT NOT NULL,
  references TEXT,
  is_double_blind BOOLEAN DEFAULT TRUE NOT NULL,
  cover_letter TEXT, -- Restricted visual scope: Editor eyes only
  file_payload_name VARCHAR(255),
  file_payload_size VARCHAR(128),
  status manuscript_status DEFAULT 'DRAFT' NOT NULL,
  submitted_at TIMESTAMP WITH TIME ZONE,
  doi VARCHAR(128) UNIQUE,
  volume VARCHAR(64),
  issue VARCHAR(255),
  published_at TIMESTAMP WITH TIME ZONE,
  author_id VARCHAR(64) REFERENCES users(id),
  editors_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Dynamic Contributors Association Table
CREATE TABLE contributors (
  id SERIAL PRIMARY KEY,
  manuscript_id VARCHAR(64) REFERENCES manuscripts(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  affiliation VARCHAR(255),
  role VARCHAR(128) DEFAULT 'Co-Author',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Peer Review Actions Log Index Table
CREATE TABLE reviewer_assignments (
  id SERIAL PRIMARY KEY,
  manuscript_id VARCHAR(64) REFERENCES manuscripts(id) ON DELETE CASCADE,
  reviewer_id VARCHAR(64) REFERENCES users(id),
  status review_status DEFAULT 'INVITED' NOT NULL,
  recommendation VARCHAR(64), -- 'ACCEPT' | 'MINOR_REVISION' | 'MAJOR_REVISION' | 'REJECT'
  comments_to_author TEXT,
  comments_to_editor TEXT, -- Confidential visual scope
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Constraints Indexing optimizations
CREATE INDEX idx_manuscripts_status ON manuscripts(status);
CREATE INDEX idx_reviewer_assigned_manuscript ON reviewer_assignments(manuscript_id);
`;

  const stateMachineMarkdown = `
# JMS Dynamic Lifecycle State Machine Schema

The transitions between manuscript state boundaries must adhere to the following conditional gates.

\`\`\`
  [ DRAFT ]               -- (Author calls SUBMIT)
      |
      v
  [ SUBMITTED ] (Unassigned Queue)
      |
      |-- (Editor assigns Reviewer) --> [ UNDER_REVIEW ] (Peer Review Cycle)
      |
      v
  [ UNDER_REVIEW ]
      |
      |-- (Reviewer logs consensus report) 
      |   && (Reports count >= 1) --> [ AWAITING_DECISION ]
      v
  [ AWAITING_DECISION ]
      |
      +-- (Editor records ACCEPT && reports >= 2) ------> [ ACCEPTED ] (Production)
      |
      +-- (Editor records REJECT && reports >= 2) ------> [ REJECTED ] (Archive)
      |
      +-- (Editor records REVISE && reports >= 1) ------> [ UNDER_REVIEW ] (Restart)
      |
      +-- [Warning 428 Precondition Unmet] (Reports < 2)
              |
              +-- (Manual override authorization key provided) --> FORCE [ ACCEPTED ] / [ REJECTED ]
\`\`\`

## Complete Operational State Grid

| Initial State | Event / Trigger | Condition / Safeguard Guards | Target State | Error Class (Unmet) |
| :--- | :--- | :--- | :--- | :--- |
| **DRAFT** | \`author_submit_draft\` | Title & Abstract present, file attached | **SUBMITTED** | \`400 Bad Request\` |
| **SUBMITTED** | \`editor_assign_reviewer\` | Valid verified academic email pointer | **UNDER_REVIEW** | \`400 Bad Request\` |
| **UNDER_REVIEW** | \`reviewer_accepts\` | Assignment state matches INVITED | **UNDER_REVIEW** | \`409 Conflict\` |
| **UNDER_REVIEW** | \`reviewer_submits_report\`| Qualitative feedback array length >= 1 | **AWAITING_DECISION** | \`400 Bad Request\` |
| **AWAITING_DECISION**| \`editor_decision_accept\` | Total submitted reviews >= 2 | **ACCEPTED** | **428 Precondition Failed** *(Override Available)* |
| **AWAITING_DECISION**| \`editor_decision_reject\` | Total submitted reviews >= 2 | **REJECTED** | **428 Precondition Failed** *(Override Available)* |
| **ACCEPTED** | \`publisher_publish_galley\`| Assigned DOI unique, galley.xml active | **PUBLISHED** | \`422 Unprocessable Entity\` |
`;

  const restApiSpecification = `
### Core REST API Parameters

### 1. SUBMIT MANUSCRIPT (AUTHOR)
* **Method & Path:** \`POST /api/v1/author/manuscripts/submit\`
* **Security Guard:** Role Verification = \`AUTHOR\`
* **Headers:** \`Authorization: Bearer <token>\`
* **Request Payload Body (JSON Schema):**
\`\`\`json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "title": { "type": "string", "minLength": 10 },
    "abstract": { "type": "string", "minLength": 50 },
    "references": { "type": "string" },
    "isDoubleBlind": { "type": "boolean" },
    "coverLetter": { "type": "string" },
    "fileToken": { "type": "string" },
    "contributors": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "email": { "type": "string", "format": "email" },
          "affiliation": { "type": "string" },
          "role": { "type": "string" }
        },
        "required": ["name", "email", "role"]
      }
    }
  },
  "required": ["title", "abstract", "isDoubleBlind", "contributors"]
}
\`\`\`
* **Success Response Payload (201 Created):**
\`\`\`json
{
  "status": "success",
  "manuscriptId": "JMS-2026-X901",
  "lifecycle": "SUBMITTED",
  "submittedAt": "2026-06-08T12:42:01Z"
}
\`\`\`

---

### 2. FETCH ANONYMIZED DISPATCH (REVIEWER GATES)
* **Method & Path:** \`GET /api/v1/reviewer/assignments/:manuscriptId\`
* **Security Guard:** Role Verification = \`REVIEWER\`
* **Anonymity Safeguard Pipeline:** If \`isDoubleBlind == true\` on table row, programmatically scrub contributors array and metadata headers before serialization.
* **Success Response Payload (200 OK):**
\`\`\`json
{
  "manuscriptId": "JMS-2026-B202",
  "title": "Securing Decentralized Federated Learning Models Against Sybil Poisoning Attacks",
  "abstract": "Decentralized federated learning is highly vulnerable to malicious Sybil...",
  "references": "[1] J. Dean et al., 'Federated Optimization...', 2019.",
  "isDoubleBlind": true,
  "filePreviewUrl": "https://cdn.jms-journal.org/files/sanitized_B202.pdf",
  "coverLetter": "[RESTRICTED - INSOLENT ROLE ACCESS STRIPPED]",
  "contributors": "[SANITIZED FOR DOUBLE-BLIND ASSIGNMENTS]"
}
\`\`\`

---

### 3. EXECUTIVE RECORD DECISION (EDITOR)
* **Method & Path:** \`POST /api/v1/editor/manuscripts/:manuscriptId/decision\`
* **Security Guard:** Role Verification = \`EDITOR\`
* **Request Payload Body (JSON Schema):**
\`\`\`json
{
  "decision": "ACCEPT", // "ACCEPT" | "REJECT" | "REVISE"
  "internalNotes": "Cache proof verified. Bypassing minimum review limits.",
  "bypassUnmetPrecondition": true, // Critical override flag!
  "bypassAuthorizationKey": "JMS_EXEC_BYPASS_2026"
}
\`\`\`
* **Conditional Warning Exception Payload (428 Precondition Required):**
*If \`bypassUnmetPrecondition\` is FALSE, and submitted reviews are < 2:*
\`\`\`json
{
  "statusCode": 428,
  "error": "Precondition Required",
  "code": "JMS_ERR_MIN_REVIEW_THRESHOLD_UNMET",
  "message": "A formal editorial decision cannot be finalized because the manuscript has not reached the required evaluation consensus threshold.",
  "parameters": {
    "manuscriptId": "JMS-2026-B202",
    "configuredMinimum": 2,
    "actualSubmitted": 1,
    "activeReviewersCount": 2
  },
  "overrideRequired": true,
  "endpoint": "/api/v1/editor/manuscript/JMS-2026-B202/decision"
}
\`\`\`
`;

  const backendPseudoCode = `
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, Response, NextFunction } from 'express';

// =========================================================================
// ROUTE SECURITY LAYER: VERIFY AUTH ROLES IN MULTI-TENANT CONTEXTS
// =========================================================================
export const checkPlatformRole = (requiredRole: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = req.headers['x-sim-role']; // Mock auth header parser
    if (userRole !== requiredRole) {
      return res.status(403).json({
        success: false,
        errorCode: "JMS_ERR_ROLE_ACCESS_DENIED",
        message: \`Security Exception: Endpoint requires target role \${requiredRole}. Sim Role: \${userRole}\`
      });
    }
    next();
  };
};

// =========================================================================
// PIPELINE GATE: DOUBLE-BLIND STRUCTURAL ANONYMIZER (ANONYMITY SAFEGUARD)
// =========================================================================
export const enforceDoubleBlindReviewerSanitation = async (
  req: Request,
  res: Response
) => {
  try {
    const { manuscriptId } = req.params;
    const manuscript = await db.manuscripts.findUnique({ id: manuscriptId });

    if (!manuscript) {
      return res.status(404).json({ error: "Manuscript row index missing" });
    }

    // Strip secrets. Cover Letters are NEVER sent to reviewer portals.
    const sanitizedRecord = {
      id: manuscript.id,
      title: manuscript.title,
      abstract: manuscript.abstract,
      references: manuscript.references,
      isDoubleBlind: manuscript.isDoubleBlind,
      fileName: manuscript.file_payload_name,
      filePreviewUrl: \`/api/files/download/\${manuscript.file_payload_name}\`
    };

    // Strict validation: Strip identifiers if Double Blind is enabled
    if (manuscript.isDoubleBlind) {
      return res.status(200).json({
        ...sanitizedRecord,
        contributors: "[ANONYMOUS DOUBLE-BLIND: METADATA ACCESS STRIPPED BY SECURITY PIPELINE]",
        coverLetter: "[RESTRICTED: REVIEW PANEL IS BLINDED TO DIRECT LETTER DETAILS]"
      });
    }

    // Otherwise, append contributors metadata for open-peer evaluation
    const contributors = await db.contributors.findMany({ manuscriptId });
    return res.status(200).json({
      ...sanitizedRecord,
      contributors,
      coverLetter: "[RESTRICTED FOR AUTHOR DISCLOSURES]"
    });

  } catch (err: any) {
    return res.status(500).json({ error: "Internal security routing failure" });
  }
};

// =========================================================================
// TRANSACTION CONTROLLER: RECORD DECISION GATE WITH CONDITIONAL OVERRIDE
// =========================================================================
export const recordEditorialDecisionGate = async (
  req: Request,
  res: Response
) => {
  const { manuscriptId } = req.params;
  const { decision, internalNotes, bypassUnmetPrecondition, bypassAuthorizationKey } = req.body;

  try {
    const manuscript = await db.manuscripts.findUnique({ id: manuscriptId });
    if (!manuscript) {
      return res.status(404).json({ error: "Manuscript not found" });
    }

    // Read reviewer report counts from db
    const reports = await db.reviewer_assignments.findMany({
      manuscriptId,
      status: 'SUBMITTED'
    });

    const reviewsCount = reports.length;
    const MIN_REQUIRED_REVIEWS = 2;

    // Trigger Warning Exception condition
    if (reviewsCount < MIN_REQUIRED_REVIEWS && (decision === 'ACCEPT' || decision === 'REJECT')) {
      if (!bypassUnmetPrecondition || bypassAuthorizationKey !== 'JMS_EXEC_BYPASS_2026') {
        // Return structured 428 Precondition Required
        return res.status(428).json({
          statusCode: 428,
          error: "Precondition Required",
          code: "JMS_ERR_MIN_REVIEW_THRESHOLD_UNMET",
          message: "Editorial processing constraint. The required minimum peer consensus has not been registered yet.",
          parameters: {
            manuscriptId,
            configuredMinimum: MIN_REQUIRED_REVIEWS,
            actualSubmitted: reviewsCount
          },
          overrideRequired: true
        });
      }
    }

    // Success transaction: transition state
    let targetStatus = 'UNDER_REVIEW';
    if (decision === 'ACCEPT') targetStatus = 'ACCEPTED';
    if (decision === 'REJECT') targetStatus = 'REJECTED';

    await db.manuscripts.update({
      where: { id: manuscriptId },
      data: {
        status: targetStatus,
        editors_notes: internalNotes
      }
    });

    // Fire automatic transaction email alerts
    await emailQueue.send({
      template: decision === 'ACCEPT' ? 'ACCEPTED_TO_PRODUCTION' : 'DECISION_REVISION_NOTIFY',
      to: manuscript.author_email,
      payload: { manuscriptId, title: manuscript.title }
    });

    return res.status(200).json({
      success: true,
      newPipelineStatus: targetStatus,
      transactionLogged: "SUCCESS",
      overrideAuthorizationLogged: bypassUnmetPrecondition ? "YES" : "NO"
    });

  } catch (err) {
    return res.status(500).json({ error: "State transition commit rolled back." });
  }
};
`;

  const getActiveTextToCopy = () => {
    switch (activeSubTab) {
      case 'DATABASE': return postgresDDL;
      case 'STATE_MACHINE': return stateMachineMarkdown;
      case 'REST_API': return restApiSpecification;
      case 'CONTROLLERS': return backendPseudoCode;
    }
  };

  return (
    <div id="architect-panel-root" className="max-w-6xl mx-auto px-4 py-8">
      
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b pb-4 mb-6 gap-3">
        <div>
          <h2 className="font-sans font-bold text-2xl text-slate-900">Technical Solution Architect Blueprint</h2>
          <p className="text-sm text-gray-500 mt-1">
            Browse and download enterprise PostgreSQL schemas, state machines, and pipeline controller code.
          </p>
        </div>

        <button
          id="btn-copy-blueprint"
          onClick={() => handleCopy(getActiveTextToCopy())}
          className="bg-slate-900 text-white font-mono hover:bg-slate-800 text-xs px-4 py-2 rounded-lg flex items-center justify-center gap-1.5 transition-all self-start sm:self-center"
        >
          {copiedText ? (
            <>
              <Check className="w-4 h-4 text-emerald-400" /> Copied Specification!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 text-emerald-400" /> Copy Active Specification
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        
        {/* SUBTAB BAR */}
        <div className="md:col-span-3 space-y-2">
          <span className="block text-[10px] font-mono uppercase tracking-widest text-gray-400 font-semibold mb-2">Architectural Modules</span>
          
          <button
            id="subtab-btn-db"
            onClick={() => setActiveSubTab('DATABASE')}
            className={`w-full text-left p-3.5 rounded-xl border text-xs transition-all flex items-center gap-2.5 ${
              activeSubTab === 'DATABASE'
                ? 'border-emerald-600 bg-emerald-50/50 hover:bg-emerald-50/70 font-semibold text-emerald-950'
                : 'bg-white hover:bg-slate-50 border-gray-200 text-gray-600'
            }`}
          >
            <Database className="w-4.5 h-4.5 text-emerald-500" />
            <div>
              <span className="block font-bold">PostgreSQL DDL Dictionaries</span>
              <span className="block text-[10px] text-gray-400 font-normal">Relation tables schemas</span>
            </div>
          </button>

          <button
            id="subtab-btn-fsm"
            onClick={() => setActiveSubTab('STATE_MACHINE')}
            className={`w-full text-left p-3.5 rounded-xl border text-xs transition-all flex items-center gap-2.5 ${
              activeSubTab === 'STATE_MACHINE'
                ? 'border-emerald-600 bg-emerald-50/50 hover:bg-emerald-50/70 font-semibold text-emerald-950'
                : 'bg-white hover:bg-slate-50 border-gray-200 text-gray-600'
            }`}
          >
            <GitFork className="w-4.5 h-4.5 text-emerald-500" />
            <div>
              <span className="block font-bold">State Machine Logic</span>
              <span className="block text-[10px] text-gray-400 font-normal">Conditional transitions rules</span>
            </div>
          </button>

          <button
            id="subtab-btn-rest"
            onClick={() => setActiveSubTab('REST_API')}
            className={`w-full text-left p-3.5 rounded-xl border text-xs transition-all flex items-center gap-2.5 ${
              activeSubTab === 'REST_API'
                ? 'border-emerald-600 bg-emerald-50/50 hover:bg-emerald-50/70 font-semibold text-emerald-950'
                : 'bg-white hover:bg-slate-50 border-gray-200 text-gray-600'
            }`}
          >
            <ArrowRightLeft className="w-4.5 h-4.5 text-emerald-500" />
            <div>
              <span className="block font-bold">REST API Gate Parameters</span>
              <span className="block text-[10px] text-gray-400 font-normal">JSON Schemas and payloads</span>
            </div>
          </button>

          <button
            id="subtab-btn-controllers"
            onClick={() => setActiveSubTab('CONTROLLERS')}
            className={`w-full text-left p-3.5 rounded-xl border text-xs transition-all flex items-center gap-2.5 ${
              activeSubTab === 'CONTROLLERS'
                ? 'border-emerald-600 bg-emerald-50/50 hover:bg-emerald-50/70 font-semibold text-emerald-950'
                : 'bg-white hover:bg-slate-50 border-gray-200 text-gray-600'
            }`}
          >
            <FileCode className="w-4.5 h-4.5 text-emerald-500" />
            <div>
              <span className="block font-bold">Execution Controllers</span>
              <span className="block text-[10px] text-gray-400 font-normal">Security guards & overrides</span>
            </div>
          </button>
        </div>

        {/* CODE RND DISPLAY */}
        <div className="md:col-span-9 bg-slate-950 border border-slate-900 rounded-2xl overflow-hidden p-5 shadow-xl relative min-h-[500px]">
          <span className="absolute top-3 right-4 font-mono uppercase text-[9px] text-gray-500 font-bold tracking-widest bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-md">
            {activeSubTab} SOLUTION LAYER SPECIFICATION
          </span>

          <pre id="code-block-viewer" className="mt-5 font-mono text-[11px] text-emerald-200 leading-normal overflow-auto whitespace-pre p-2 max-h-[600px]">
            {activeSubTab === 'DATABASE' && postgresDDL}
            {activeSubTab === 'STATE_MACHINE' && stateMachineMarkdown}
            {activeSubTab === 'REST_API' && restApiSpecification}
            {activeSubTab === 'CONTROLLERS' && backendPseudoCode}
          </pre>
        </div>

      </div>

    </div>
  );
}
