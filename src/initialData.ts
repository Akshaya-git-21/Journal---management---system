import { Manuscript } from './types';

export const INITIAL_MANUSCRIPTS: Manuscript[] = [
  {
    id: "JMS-2026-A101",
    title: "An Empirical Analysis of Lock-Free Multi-Tenant Cache Replication Protocols",
    abstract: "This paper analyzes the throughput scaling characteristics of lock-free cache replication over modern multi-tenant cloud substrates. We formulate a mathematically provable state barrier for high-concurrency systems, showing how contention bottlenecks can be mitigated via localized optimistic concurrency trees.",
    references: "[1] L. Lamport, 'Time, Clocks, and the Ordering of Events,' CACM, 1978.\n[2] M. Herlihy, 'Optimistic Cache Replication,' ACM Transactions, 2015.",
    isDoubleBlind: true, // Double-blind active
    coverLetter: "Dear Editors,\n\nOur team is pleased to submit this manuscript. We have stripped all author details from the main manuscript text to preserve the double-blind review process. This work is not currently under consideration elsewhere.\n\nBest regards,\nDr. Ada Lovelace",
    fileName: "cache_replication_draft_v2.pdf",
    fileSize: "2.4 MB",
    uploadedAt: "2026-06-01T09:14:00Z",
    contributors: [
      {
        id: "c1",
        name: "Ada Lovelace",
        email: "ada@computing.org",
        affiliation: "Stanford Dept of Computer Science",
        role: "Primary Author"
      },
      {
        id: "c2",
        name: "Charles Babbage",
        email: "charles@differential.edu",
        affiliation: "Cambridge Engineering Labs",
        role: "Co-Author"
      }
    ],
    status: 'SUBMITTED', // Unassigned editor queue
    submittedAt: "2026-06-01T10:15:00Z",
    reviewers: [],
    doi: null,
    volume: null,
    issue: null,
    publishedAt: null,
    authorId: "auth_ada",
    authorName: "Ada Lovelace",
    authorEmail: "ada@computing.org",
    submissionStep: 5,
    editorsNotes: "",
    assignedEditor: "Unassigned",
    assignedEditorEmail: null,
    suggestedReviewers: [],
    discussions: []
  },
  {
    id: "JMS-2026-B202",
    title: "Securing Decentralized Federated Learning Models Against Sybil Poisoning Attacks",
    abstract: "Decentralized federated learning is highly vulnerable to malicious Sybil nodes injecting poison gradients. In this paper, we introduce a novel decentralized dynamic consensus algorithm (Proof-of-Validation) that filters updates by evaluating structural gradient divergence.",
    references: "[1] J. Dean et al., 'Federated Optimization in Deep Learning,' IEEE, 2019.\n[2] S. Nakamoto, 'Proof-of-Consensus Divergence Frameworks,' 2021.",
    isDoubleBlind: true,
    coverLetter: "Dear Editors,\n\nThis manuscript introduces our dynamic gradient validation framework. We look forward to receiving architectural review comments.\n\nBest,\nDr. Alan Turing",
    fileName: "federated_learning_sybil_defense.pdf",
    fileSize: "4.1 MB",
    uploadedAt: "2026-06-03T11:45:00Z",
    contributors: [
      {
        id: "t1",
        name: "Alan Turing",
        email: "turing@enigma.labs",
        affiliation: "Princeton Institute for Advanced Study",
        role: "Primary Author"
      }
    ],
    status: 'UNDER_REVIEW', // In Review
    submittedAt: "2026-06-03T11:55:00Z",
    reviewers: [
      {
        id: "rev1",
        name: "Prof. Grace Hopper",
        email: "grace@cober.org",
        status: 'SUBMITTED', // Already reviewed
        recommendation: 'MINOR_REVISION',
        commentsToAuthor: "The mathematical proof in Section 3 is solid. However, the simulation parameters in Section 4 should explicitly list the epoch learning rates. This is a very valuable addition to federated defense systems.",
        commentsToEditor: "Excellent paper. Double-blind was successfully validated—no identifying metadata is present in the document. I strongly support acceptance after a minor update.",
        assignedAt: "2026-06-04T08:00:00Z",
        completedAt: "2026-06-05T14:30:00Z",
        evaluation: {
          expertiseArea: "Symmetric Compilers & Distributed Gradients",
          scientificMerit: 9,
          noveltyInnovation: 8,
          methodologyQuality: 8,
          literatureAdequacy: 9,
          ethicalCompliance: 10,
          dataReliability: 8,
          writingQuality: 9,
          strengths: "The structural gradient divergence formula is mathematically sound and elegantly handles malicious injection boundaries with minimal overhead.",
          weaknesses: "Simulation details in Section 4 are somewhat sparse. Standard hyperparameter learning rates during gradient validation epochs are not explicitly stated.",
          mandatoryRevisions: "1. Specify epoch-level validation learning rate constants.\n2. Standardize gradient vectors formatting variables."
        }
      },
      {
        id: "rev2",
        name: "Dr. Richard Hamming",
        email: "hamming@error-correction.net",
        status: 'ACCEPTED', // Accepted, but review not yet submitted
        recommendation: null,
        commentsToAuthor: "",
        commentsToEditor: "",
        assignedAt: "2026-06-04T08:05:00Z"
      }
    ],
    doi: null,
    volume: null,
    issue: null,
    publishedAt: null,
    authorId: "auth_turing",
    authorName: "Alan Turing",
    authorEmail: "turing@enigma.labs",
    submissionStep: 5,
    editorsNotes: "Assigned two reviewers immediately. Hopper was very fast with submission. Need one more full report before decision threshold, or Editor manual override.",
    assignedEditor: "Dr. Cynthia Dwork",
    assignedEditorEmail: "editor@stanford.edu",
    suggestedReviewers: [],
    discussions: []
  },
  {
    id: "JMS-2026-C303",
    title: "Low-Latency Sharding Mechanisms for Spanner-Class Relational Architectures",
    abstract: "Distributed ACID transactions require expensive multi-phase consensus blocks. By leveraging synchronized global GPS clocks and optimistic regional partition locks, we demonstrate a sub-millisecond sharding router that scales write overhead near-linearly.",
    references: "[1] J. Corbett et al., 'Spanner: Google’s Globally Distributed Database,' ACM TOCS, 2013.\n[2] E. Brewer, 'The CAP Theorem Over a Decade,' Computer, 2012.",
    isDoubleBlind: false, // Single-blind or open
    coverLetter: "Dear Editorial Board,\n\nWe present low-latency sharding structures tailored specifically for relational consensus architectures.\n\nSincerely,\nDr. Barbara Liskov",
    fileName: "liskov_spanner_sharding_final.pdf",
    fileSize: "1.8 MB",
    uploadedAt: "2026-06-02T14:10:00Z",
    contributors: [
      {
        id: "l1",
        name: "Barbara Liskov",
        email: "liskov@mit.edu",
        affiliation: "MIT Computer Science & AI Lab (CSAIL)",
        role: "Primary Author"
      }
    ],
    status: 'ACCEPTED', // In Production (needs publisher to assign DOI and issue)
    submittedAt: "2026-06-02T14:30:00Z",
    reviewers: [
      {
        id: "rev3",
        name: "Prof. Donald Knuth",
        email: "knuth@stanford.edu",
        status: 'SUBMITTED',
        recommendation: 'ACCEPT',
        commentsToAuthor: "Superb execution. Formally complete and extremely elegant locking logic.",
        commentsToEditor: "A masterpiece of database routing. Publish without hesitation.",
        assignedAt: "2026-06-02T15:00:00Z",
        completedAt: "2026-06-04T10:15:00Z"
      },
      {
        id: "rev4",
        name: "Dr. Leslie Lamport",
        email: "lamport@paxos.sys",
        status: 'SUBMITTED',
        recommendation: 'ACCEPT',
        commentsToAuthor: "The temporal clock sync coordinates provide superior ordering guarantees. Minor typo on page 7.",
        commentsToEditor: "Outstanding systems paper.",
        assignedAt: "2026-06-02T15:05:00Z",
        completedAt: "2026-06-04T12:40:00Z"
      }
    ],
    doi: null,
    volume: null,
    issue: null,
    publishedAt: null,
    authorId: "auth_liskov",
    authorName: "Barbara Liskov",
    authorEmail: "liskov@mit.edu",
    submissionStep: 5,
    editorsNotes: "Both reviews came back as accept. Formally moved to production.",
    suggestedReviewers: [],
    discussions: []
  },
  {
    id: "JMS-2026-D404",
    title: "Optimizing Deep Learning Compilation Pipelines for Heterogeneous Edge Accelerators",
    abstract: "Edge inference workloads suffer from diverse compute profiles across custom silicon blocks. This paper presents an optimizing intermediate representation (IR) compiler that automatically transforms neural network graphs into tile-optimized schedules.",
    references: "[1] T. Chen et al., 'TVM: An End-to-End Deep Learning Compilation System,' OSDI, 2018.",
    isDoubleBlind: true,
    coverLetter: "Dear Editors,\n\nWe present compilers optimized for heterogeneous edge platforms.\n\nWarm regards,\nDr. Claude Shannon",
    fileName: "edge_ir_compiler_shannon_v4.pdf",
    fileSize: "3.2 MB",
    uploadedAt: "2026-05-10T11:00:00Z",
    contributors: [
      {
        id: "s1",
        name: "Claude Shannon",
        email: "shannon@information.theory",
        affiliation: "Bell Labs Systems Research",
        role: "Primary Author"
      }
    ],
    status: 'PUBLISHED', // Archived
    submittedAt: "2026-05-10T11:20:00Z",
    reviewers: [
      {
        id: "rev5",
        name: "Prof. Edsger Dijkstra",
        email: "dijkstra@shortestpath.nl",
        status: 'SUBMITTED',
        recommendation: 'ACCEPT',
        commentsToAuthor: "The graph partitioning proofs are clear.",
        commentsToEditor: "Highly acceptable systems paper.",
        assignedAt: "2026-05-11T09:00:00Z",
        completedAt: "2026-05-13T14:00:00Z"
      },
      {
        id: "rev6",
        name: "Dr. John von Neumann",
        email: "neumann@ias.edu",
        status: 'SUBMITTED',
        recommendation: 'ACCEPT',
        commentsToAuthor: "Excellent compile-time scheduling calculations.",
        commentsToEditor: "Fascinating work. Fully complete.",
        assignedAt: "2026-05-11T09:10:00Z",
        completedAt: "2026-05-14T10:30:00Z"
      }
    ],
    doi: "10.1016/j.jms.2026.0404",
    volume: "Volume 14",
    issue: "Issue 3 (High-Performance Edge AI)",
    publishedAt: "2026-05-20T16:00:00Z",
    authorId: "auth_shannon",
    authorName: "Claude Shannon",
    authorEmail: "shannon@information.theory",
    submissionStep: 5,
    editorsNotes: "Successfully published. DOI issued and indexed.",
    suggestedReviewers: [],
    discussions: []
  }
];

export const AVAILABLE_REVIEWERS = [
  { id: "rev1", name: "Prof. Grace Hopper", email: "grace@cober.org", affiliation: "Navy Compiler Division" },
  { id: "rev2", name: "Dr. Richard Hamming", email: "hamming@error-correction.net", affiliation: "Bell Telephone Labs" },
  { id: "rev3", name: "Prof. Donald Knuth", email: "knuth@stanford.edu", affiliation: "Stanford TeX Group" },
  { id: "rev4", name: "Dr. Leslie Lamport", email: "lamport@paxos.sys", affiliation: "Digital Equipment Corp" },
  { id: "rev5", name: "Prof. Edsger Dijkstra", email: "dijkstra@shortestpath.nl", affiliation: "University of Texas" },
  { id: "rev6", name: "Dr. John von Neumann", email: "neumann@ias.edu", affiliation: "IAS Quantum Projects" },
  { id: "rev7", name: "Dr. Barbara Liskov", email: "liskov@mit.edu", affiliation: "MIT CSAIL" },
  { id: "rev8", name: "Dr. Tim Berners-Lee", email: "timbl@w3.org", affiliation: "CERN Grid" },
  { id: "rev-susy", name: "Susy Decarlo", email: "decarlo@reviewers.com", affiliation: "Medical Informatics Lab" },
  { id: "rev-claris", name: "Claris Clevinger", email: "clevinger@reviewers.com", affiliation: "Bio-AI Safety Labs" }
];
