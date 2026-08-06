# Complete Manuscript Workflow Guide

## 📋 STAGE 1: AUTHOR SUBMISSION

### Author Workspace
1. Click **"+ New Submission"**
2. Fill submission form:
   - Title, Abstract, References
   - Upload manuscript files
   - Add contributors
   - Select keywords
3. Click **"Submit"** → Status: `SUBMITTED`

**What happens behind the scenes:**
- Creates `manuscripts` record with status = SUBMITTED
- Files stored in `manuscript_files` table
- Contributors stored in `manuscript_contributors`
- `submitted_at` timestamp recorded
- Real-time subscription triggers → Coordinator dashboard updates

**Author Dashboard Shows:**
```
✓ Submitted: 1
✓ Under Review: 0
✓ Revisions: 0
```

---

## 📊 STAGE 2: COORDINATOR RECEIVES SUBMISSION

### Coordinator Workspace → "Manuscript Queue" tab
1. New manuscript appears in **"Unassigned Queue"** (status: SUBMITTED)
2. Coordinator reviews:
   - Manuscript ID
   - Title
   - Author info
   - Submission date
3. Clicks **manuscript → Opens detail view**

**Can perform:**
- Assign to Editor
- View metadata
- Check for plagiarism
- Download files

**Status Update:**
When assigned → Status changes to: `EDITOR_REVIEW`

```
Coordinator clicks "Assign Editor"
    → Selects editor from dropdown
    → Creates editor_assignments record
    → Manuscript status → EDITOR_REVIEW
    → Editor dashboard updates in real-time
```

---

## 👨‍⚖️ STAGE 3: EDITOR RECEIVES ASSIGNMENT

### Editor Workspace
**Real-time notification:** Editor sees new manuscript in dashboard

Editor views manuscript with:
- Title & Abstract (professional PDF viewer)
- Contributors list
- Files for Review
- Editor Evaluation tab
- Revisions tab (empty at this stage)

### Editor Actions:
1. **Fill Editor Evaluation Form:**
   - Scientific Merit (1-10)
   - Novelty & Innovation (1-10)
   - Methodology Quality (1-10)
   - Validity of Results (1-10)
   - Clarity & Presentation (1-10)
   - Ethical Standards (1-10)
   - Strengths/Weaknesses
   - Mandatory Revisions
   - Comments to Coordinator

2. **Suggest Peer Reviewers:**
   - Add name, email, expertise
   - Pre-populated suggestions shown

3. Click **"SUBMIT EVALUATION"**

**Status Update:**
- Assessment stored in `editor_assignments`
- `assessment_status` → SUBMITTED
- Manuscript stays in EDITOR_REVIEW

---

## 👥 STAGE 4: COORDINATOR ASSIGNS REVIEWERS

### Coordinator Workspace → "Peer Review" tab
1. Sees manuscript with "Awaiting Reviewers" status
2. Views editor's evaluation
3. Selects 2 reviewers from:
   - Suggested by editor
   - Coordinator's database
   - Active reviewers list

4. Click **"Assign Reviewers"**

**What happens:**
```
Creates reviewer_assignments records (1 for each reviewer)
    Status: INVITED
    assigned_at: current timestamp
    due_date: 14 days from now
    
Manuscript status → UNDER_REVIEW

Real-time updates:
- Reviewer dashboard sees new invitations
- Coordinator sees assignment confirmation
```

---

## 📝 STAGE 5: REVIEWERS SUBMIT REVIEWS

### Reviewer Workspace
1. Sees **"Pending Reviews"** count: 2
2. Clicks manuscript → Opens detail view
3. Can download all files
4. Fills review form:
   - Recommendation: (ACCEPT / MINOR_REVISION / MAJOR_REVISION / REJECT)
   - Scientific Merit (1-10)
   - Novelty (1-10)
   - Methodology (1-10)
   - Literature Adequacy (1-10)
   - Ethical Compliance (1-10)
   - Data Reliability (1-10)
   - Writing Quality (1-10)
   - Comments to Author
   - Comments to Editor

5. Click **"SUBMIT REVIEW"**

**Status Update:**
```
Each review:
    reviewer_assignments.status → SUBMITTED
    submitted_at: current timestamp
    
When both reviews in:
    Manuscript status → AWAITING_DECISION
    Coordinator dashboard updates
    Editor gets notification
```

---

## ⚖️ STAGE 6: EDITOR MAKES FINAL DECISION

### Editor Workspace → "Editor Evaluation" tab
1. See all reviewer comments side-by-side
2. Access editor's own evaluation
3. Review strengths/weaknesses compiled
4. Make final decision:

### Decision Options:

**Option A: ✅ ACCEPT**
```
Click "Accept Manuscript"
    → Modal appears
    → Write acceptance letter
    → Submit decision
    
Status: ACCEPTED
    → Author notified
    → Publisher notified
    → Next stage: Copyediting
```

**Option B: 🟡 MINOR REVISION NEEDED**
```
Click "Request Minor Revision"
    → Modal appears
    → Write decision letter with revision requests
    → Submit decision
    
Creates manuscript_revisions record:
    revision_number: 1
    status: AWAITING_AUTHOR_UPLOAD
    decision_letter: [stored]
    
Manuscript status: REVISION_REQUESTED

Real-time updates:
    → Author dashboard shows REVISION_REQUESTED
    → Coordinator dashboard shows "Pending Revisions"
    → Author immediately sees revision request
```

**Option C: 🟠 MAJOR REVISION NEEDED**
```
Same as Minor Revision, but:
    - Higher urgency
    - May need re-review by same reviewers
```

**Option D: ❌ REJECT**
```
Click "Decline Submission"
    → Modal appears
    → Write rejection letter
    → Submit decision
    
Manuscript status: REJECTED
    → Author notified
    → Workflow ends
```

---

## 🔄 STAGE 7: REVISION CYCLE (if applicable)

### Author Workspace → Opens Manuscript
```
Status: REVISION_REQUESTED
    → AuthorRevisionRequest component renders
    → Shows decision letter
    → Upload revised files
```

**Author Actions:**
1. Read decision letter
2. Upload revised files via drag-drop:
   - Revised manuscript
   - Response letter (optional)
3. Click **"Submit Revised Manuscript"**

**Status Updates:**
```
Uploaded files stored in manuscript_files with revision_id

revision_status: AWAITING_AUTHOR_UPLOAD → REVISION_SUBMITTED

Real-time updates:
    → Coordinator sees "Revision Submitted"
    → Can download files immediately
    → No delay in notification
```

### Coordinator Workspace → "Revisions" tab
```
1. Sees "Revision #1 - Submitted"
2. Downloads revised files
3. Checks author's response
4. Selects same editor (or different)
5. Click "Send to Editor"
```

**Creates New Assignment:**
```
New editor_assignments record:
    editor_id: [same or new editor]
    status: INVITED
    manuscript_id: [same]
    
Manuscript status: EDITOR_REVIEW (again)
    
Real-time update:
    → Editor dashboard shows "Revision 1"
    → Revisions tab now shows revision timeline
```

### Editor Workspace → "Revisions" tab
```
1. See Revision #1 in timeline
2. Download revised manuscript
3. Compare with original
4. Re-review if needed
5. Decision options:
   - ACCEPT (finally approve)
   - MINOR_REVISION (more changes needed)
   - MAJOR_REVISION (major issues remain)
   - REJECT (still not acceptable)
```

**Cycle repeats until:** ACCEPT or REJECT

---

## ✅ STAGE 8: ACCEPTED MANUSCRIPT

### When Editor Clicks "Accept"
```
Manuscript status: ACCEPTED
    
Real-time updates:
    → Author sees "ACCEPTED" badge
    → Coordinator sees in "Resolved" queue
    → Publisher workspace gets notification
    → Production workflow begins
```

### Author Dashboard
```
✓ Accepted: 1
✓ Scheduled for publication: 1
```

---

## 📚 STAGE 9: COPYEDITING & PRODUCTION

### Publisher/Production Workspace
1. Receives accepted manuscript
2. Assigns to copyeditor
3. Copyediting phase begins
4. Author reviews copyedits
5. Final proofs prepared

**Status:** UNDER_COPYEDIT (if implemented)

---

## 🎉 STAGE 10: PUBLICATION

### Publisher Assigns
```
Volume: 45
Issue: 3
DOI: 10.xxxx/xxxxx
Publication date: September 2025

Click "Mark Published"
```

**Status Update:**
```
Manuscript status: PUBLISHED
    published_at: current timestamp
    doi: [assigned]
    volume: 45
    issue: 3
    
Real-time updates:
    → Author dashboard: Published: 1
    → Appears in article listing
    → Public website updated
```

### Author Dashboard Final Status
```
Published: 1 ✓
Accepted & Scheduled: 0
Under Review: 0
Revisions Requested: 0
Rejected: 0
```

---

## 📊 COMPLETE DATA FLOW DIAGRAM

```
AUTHOR SUBMITS
    ↓
    ↓ [Manuscript Record Created]
    ↓ Status: SUBMITTED
    ↓
COORDINATOR RECEIVES
    ↓ [Real-time notification]
    ↓ Assigns to Editor
    ↓ Status: EDITOR_REVIEW
    ↓
EDITOR REVIEWS
    ↓ [Real-time notification]
    ↓ Fills evaluation form
    ↓ Suggests reviewers
    ↓
COORDINATOR ASSIGNS REVIEWERS
    ↓ [Real-time notification to reviewers]
    ↓ Status: UNDER_REVIEW
    ↓
REVIEWERS SUBMIT
    ↓ [Each review logged]
    ↓ Status: AWAITING_DECISION
    ↓
EDITOR DECIDES
    ↓
    ├─ ACCEPT → Status: ACCEPTED → PUBLISHED
    │
    ├─ REJECT → Status: REJECTED → END
    │
    └─ REVISION → Status: REVISION_REQUESTED
        ↓
        AUTHOR RECEIVES & UPLOADS
        ↓ [Real-time: author sees revision]
        ↓
        COORDINATOR RECEIVES & RE-ASSIGNS
        ↓ [Real-time: coordinator notified]
        ↓
        EDITOR RE-REVIEWS (Revision #2)
        ↓
        └─ Loop back to EDITOR DECIDES
```

---

## ⚡ REAL-TIME UPDATES THROUGHOUT

Every dashboard uses `subscribeToManuscripts()`:

```javascript
// Whenever ANY status changes:
- Author dashboard updates instantly
- Coordinator dashboard updates instantly
- Editor dashboard updates instantly
- Reviewer dashboard updates instantly
- Publisher dashboard updates instantly

// NO PAGE REFRESH NEEDED
// NO POLLING NEEDED
// REAL-TIME VIA SUPABASE SUBSCRIPTIONS
```

---

## 🗂️ Database Tables Involved

| Table | Updated When |
|-------|--------------|
| `manuscripts` | Status changes (submitted → review → revision → accepted → published) |
| `manuscript_files` | Files uploaded (initial + each revision) |
| `manuscript_contributors` | Author info stored |
| `editor_assignments` | Editor assigned/reassigned |
| `editor_assessments` | Editor fills evaluation form |
| `reviewer_assignments` | Reviewers assigned/reviews submitted |
| `manuscript_revisions` | Revision requested/submitted (tracks revision cycle) |
| `manuscript_status_history` | Audit trail of all status changes |
| `workflow_notifications` | Notifications sent to users |

---

## 💡 Key Points

✅ **Atomic transactions** - All status changes validated server-side via RPCs
✅ **Real-time updates** - No delay between actions and notifications
✅ **Audit trail** - Every change logged in status_history
✅ **Revision cycles** - Unlimited revision attempts
✅ **File versioning** - Each revision keeps separate files
✅ **Decision tracking** - All decisions stored with letters/reasons
✅ **Role-based access** - Each user sees only their assigned work
✅ **Notification cascade** - Each action triggers notifications to relevant users
