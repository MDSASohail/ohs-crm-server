// controllers/candidate.controller.js
// Handles all candidate management operations.
//
// Routes:
// POST   /api/candidates          — create candidate (root, admin, staff)
// GET    /api/candidates          — list all candidates (all roles)
// GET    /api/candidates/search   — search candidates (all roles)
// GET    /api/candidates/:id      — get single candidate (all roles)
// PUT    /api/candidates/:id      — update candidate (root, admin, staff)
// DELETE /api/candidates/:id      — soft delete (root, admin, staff)
//
// Design decisions:
// — Email and mobile are not unique per tenant —
//   the same person could theoretically be entered
//   twice by different staff members. We warn but
//   do not block on duplicate mobile/email.
// — emailCredential (institute portal login) is
//   stored as plain text by design — these are
//   third party credentials, not our system passwords
// — Search uses MongoDB text index for fullName,
//   email, mobile, and currentCompany
// — Root sees deleted candidates, others do not

import Candidate from "../models/Candidate.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { logActivity } from "../utils/activityLogger.js";

// ─────────────────────────────────────────
// @route   POST /api/candidates
// @access  Root, Admin, Staff
// @desc    Create a new candidate
// ─────────────────────────────────────────
const createCandidate = asyncHandler(async (req, res) => {
  const {
    fullName,
    nameOnCertificate,
    dob,
    email,
    mobile,
    alternativeMobile,
    address,
    qualification,
    currentCompany,
    fatherName,
    fatherMobile,
    fatherOccupation,
    motherName,
    motherMobile,
    emailCredential,
    referredBy,
    notes,
  } = req.body;

  // Only fullName is required — all other fields are optional
  if (!fullName || !fullName.trim()) {
    throw new ApiError(400, "Full name is required");
  }

  // Warn if mobile already exists in this tenant
  // We do not block — just inform via response message
  let duplicateWarning = null;
  if (mobile) {
    const existingMobile = await Candidate.findOne({
      tenantId: req.tenantId,
      mobile: mobile.trim(),
      isDeleted: false,
    });

    if (existingMobile) {
      duplicateWarning = `A candidate with mobile ${mobile} already exists — please verify this is not a duplicate`;
    }
  }

  const candidate = await Candidate.create({
    tenantId: req.tenantId,
    fullName: fullName.trim(),
    nameOnCertificate: nameOnCertificate?.trim() || null,
    dob: dob || null,
    email: email?.toLowerCase().trim() || null,
    mobile: mobile?.trim() || null,
    alternativeMobile: alternativeMobile?.trim() || null,
    address: address?.trim() || null,
    qualification: qualification?.trim() || null,
    currentCompany: currentCompany?.trim() || null,
    fatherName: fatherName?.trim() || null,
    fatherMobile: fatherMobile?.trim() || null,
    fatherOccupation: fatherOccupation?.trim() || null,
    motherName: motherName?.trim() || null,
    motherMobile: motherMobile?.trim() || null,
    emailCredential: emailCredential || { email: null, password: null },
    referredBy: referredBy?.trim() || null,
    notes: notes?.trim() || null,
    createdBy: req.user._id,
  });

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "CREATE_CANDIDATE",
    entityType: "candidate",
    entityId: candidate._id,
    description: `${req.user.name} created candidate ${candidate.fullName}`,
  });

  return res.status(201).json(
    new ApiResponse(
      201,
      { candidate, warning: duplicateWarning },
      duplicateWarning
        ? "Candidate created with warning"
        : "Candidate created successfully"
    )
  );
});

// ─────────────────────────────────────────
// @route   GET /api/candidates
// @access  All roles
// @desc    List all candidates with pagination
//          Supports query params:
//          ?page=1&limit=20
//          ?referredBy=someone
//          ?sortBy=fullName&sortOrder=asc
//          Root sees deleted candidates too
// ─────────────────────────────────────────

// This is given by the backend, I am modifying it from frontend conversation
// const getCandidates = asyncHandler(async (req, res) => {
//   const {
//     page = 1,
//     limit = 20,
//     referredBy,
//     sortBy = "createdAt",
//     sortOrder = "desc",
//   } = req.query;

//   const filter = { tenantId: req.tenantId };

//   // Non-root users never see deleted candidates
//   if (req.user.role !== "root") {
//     filter.isDeleted = false;
//   }

//   // Filter by referral source if provided
//   if (referredBy) {
//     filter.referredBy = { $regex: referredBy, $options: "i" };
//   }

//   // Pagination
//   const pageNum = parseInt(page, 10);
//   const limitNum = parseInt(limit, 10);
//   const skip = (pageNum - 1) * limitNum;

//   // Sort
//   const sortOptions = {};
//   sortOptions[sortBy] = sortOrder === "asc" ? 1 : -1;

//   const [candidates, total] = await Promise.all([
//     Candidate.find(filter)
//       .sort(sortOptions)
//       .skip(skip)
//       .limit(limitNum)
//       .select("-emailCredential")
//       // emailCredential is sensitive — excluded from list view
//       // it is available in the single candidate detail view
//       .populate("createdBy", "name email"),
//     Candidate.countDocuments(filter),
//   ]);

//   return res.status(200).json(
//     new ApiResponse(
//       200,
//       {
//         candidates,
//         pagination: {
//           total,
//           page: pageNum,
//           limit: limitNum,
//           totalPages: Math.ceil(total / limitNum),
//         },
//       },
//       "Candidates fetched successfully"
//     )
//   );
// });

const getCandidates = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    search,
    referredBy,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;



  const filter = { tenantId: req.tenantId };

  // Non-root users never see deleted candidates
  if (req.user.role !== "root") {
    filter.isDeleted = false;
  }

  // Search across name, email, and mobile
  if (search) {
    filter.$or = [
      { fullName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { mobile: { $regex: search, $options: "i" } },
    ];
  }

  // Filter by referral source if provided
  if (referredBy) {
    filter.referredBy = { $regex: referredBy, $options: "i" };
  }

  // Pagination
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  // Sort
  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === "asc" ? 1 : -1;

  const [candidates, total] = await Promise.all([
    Candidate.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum)
      .select("-emailCredential")
      // emailCredential is sensitive — excluded from list view
      // it is available in the single candidate detail view
      .populate("createdBy", "name email"),
    Candidate.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        candidates,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      },
      "Candidates fetched successfully"
    )
  );
});

// ─────────────────────────────────────────
// @route   GET /api/candidates/search
// @access  All roles
// @desc    Search candidates by name, mobile,
//          email, or current company
//          Uses MongoDB text index for relevance
//          Also supports simple regex fallback
//          for partial mobile/email searches
//
//          Query params:
//          ?q=search term (required)
//          ?page=1&limit=10
// ─────────────────────────────────────────
const searchCandidates = asyncHandler(async (req, res) => {
  const { q, page = 1, limit = 10 } = req.query;

  if (!q || !q.trim()) {
    throw new ApiError(400, "Search query is required");
  }

  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  const tenantFilter = { tenantId: req.tenantId };
  if (req.user.role !== "root") {
    tenantFilter.isDeleted = false;
  }

  // Use $or to search across multiple fields with regex
  // This is more flexible than text index for partial matches
  // e.g. searching "987" matches any mobile containing "987"
  const searchFilter = {
    ...tenantFilter,
    $or: [
      { fullName: { $regex: q.trim(), $options: "i" } },
      { mobile: { $regex: q.trim(), $options: "i" } },
      { email: { $regex: q.trim(), $options: "i" } },
      { currentCompany: { $regex: q.trim(), $options: "i" } },
      { nameOnCertificate: { $regex: q.trim(), $options: "i" } },
    ],
  };

  const [candidates, total] = await Promise.all([
    Candidate.find(searchFilter)
      .sort({ fullName: 1 })
      .skip(skip)
      .limit(limitNum)
      .select("-emailCredential")
      .populate("createdBy", "name email"),
    Candidate.countDocuments(searchFilter),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        candidates,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      },
      `Found ${total} candidate(s) matching "${q}"`
    )
  );
});

// ─────────────────────────────────────────
// @route   GET /api/candidates/:id
// @access  All roles
// @desc    Get a single candidate by ID
//          Includes emailCredential — only shown
//          in detail view, not in list view
// ─────────────────────────────────────────
const getCandidateById = asyncHandler(async (req, res) => {
  const filter = {
    _id: req.params.id,
    tenantId: req.tenantId,
  };

  if (req.user.role !== "root") {
    filter.isDeleted = false;
  }

  const candidate = await Candidate.findOne(filter).populate(
    "createdBy",
    "name email"
  );

  if (!candidate) {
    throw new ApiError(404, "Candidate not found");
  }

  return res.status(200).json(
    new ApiResponse(200, candidate, "Candidate fetched successfully")
  );
});

// ─────────────────────────────────────────
// @route   PUT /api/candidates/:id
// @access  Root, Admin, Staff
// @desc    Update candidate details
//          All fields are optional — only provided
//          fields are updated
// ─────────────────────────────────────────
const updateCandidate = asyncHandler(async (req, res) => {
  const {
    fullName,
    nameOnCertificate,
    dob,
    email,
    mobile,
    alternativeMobile,
    address,
    qualification,
    currentCompany,
    fatherName,
    fatherMobile,
    fatherOccupation,
    motherName,
    motherMobile,
    emailCredential,
    referredBy,
    notes,
  } = req.body;

  const candidate = await Candidate.findOne({
    _id: req.params.id,
    tenantId: req.tenantId,
    isDeleted: false,
  });

  if (!candidate) {
    throw new ApiError(404, "Candidate not found");
  }

  // Build updates object — only include provided fields
  const updates = {};

  if (fullName !== undefined) {
    if (!fullName.trim()) throw new ApiError(400, "Full name cannot be empty");
    updates.fullName = fullName.trim();
  }
  if (nameOnCertificate !== undefined)
    updates.nameOnCertificate = nameOnCertificate?.trim() || null;
  if (dob !== undefined) updates.dob = dob || null;
  if (email !== undefined)
    updates.email = email?.toLowerCase().trim() || null;
  if (mobile !== undefined) updates.mobile = mobile?.trim() || null;
  if (alternativeMobile !== undefined)
    updates.alternativeMobile = alternativeMobile?.trim() || null;
  if (address !== undefined) updates.address = address?.trim() || null;
  if (qualification !== undefined)
    updates.qualification = qualification?.trim() || null;
  if (currentCompany !== undefined)
    updates.currentCompany = currentCompany?.trim() || null;
  if (fatherName !== undefined)
    updates.fatherName = fatherName?.trim() || null;
  if (fatherMobile !== undefined)
    updates.fatherMobile = fatherMobile?.trim() || null;
  if (fatherOccupation !== undefined)
    updates.fatherOccupation = fatherOccupation?.trim() || null;
  if (motherName !== undefined)
    updates.motherName = motherName?.trim() || null;
  if (motherMobile !== undefined)
    updates.motherMobile = motherMobile?.trim() || null;
  if (emailCredential !== undefined)
    updates.emailCredential = emailCredential;
  if (referredBy !== undefined)
    updates.referredBy = referredBy?.trim() || null;
  if (notes !== undefined) updates.notes = notes?.trim() || null;

  if (Object.keys(updates).length === 0) {
    throw new ApiError(400, "No valid fields provided for update");
  }

  const updatedCandidate = await Candidate.findByIdAndUpdate(
    req.params.id,
    { $set: updates },
    { new: true, runValidators: true }
  ).populate("createdBy", "name email");

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "UPDATE_CANDIDATE",
    entityType: "candidate",
    entityId: updatedCandidate._id,
    description: `${req.user.name} updated candidate ${updatedCandidate.fullName}`,
  });

  return res.status(200).json(
    new ApiResponse(200, updatedCandidate, "Candidate updated successfully")
  );
});

// ─────────────────────────────────────────
// @route   DELETE /api/candidates/:id
// @access  Root, Admin, Staff
// @desc    Soft delete a candidate
//          Hidden from all users except root
//          All enrollments and documents remain
//          intact — nothing cascades
// ─────────────────────────────────────────
const deleteCandidate = asyncHandler(async (req, res) => {
  const candidate = await Candidate.findOneAndUpdate(
    {
      _id: req.params.id,
      tenantId: req.tenantId,
      isDeleted: false,
    },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user._id,
      },
    },
    { new: true }
  );

  if (!candidate) {
    throw new ApiError(404, "Candidate not found");
  }

  await logActivity({
    tenantId: req.tenantId,
    userId: req.user._id,
    action: "DELETE_CANDIDATE",
    entityType: "candidate",
    entityId: candidate._id,
    description: `${req.user.name} deleted candidate ${candidate.fullName}`,
  });

  return res.status(200).json(
    new ApiResponse(200, null, "Candidate deleted successfully")
  );
});

export {
  createCandidate,
  getCandidates,
  searchCandidates,
  getCandidateById,
  updateCandidate,
  deleteCandidate,
};