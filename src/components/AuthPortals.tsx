import React, { useState } from 'react';
import { Role } from '../types';
import { registerSupabaseUser, loginSupabaseUser } from '../lib/supabase';
import TuliticsLogo from './TuliticsLogo';
import { 
  Shield, 
  Key, 
  Mail, 
  Globe, 
  ArrowLeft, 
  Loader2, 
  Sparkles, 
  AlertCircle, 
  CheckCircle, 
  User, 
  Building, 
  Phone, 
  BookOpen, 
  Sliders, 
  Award, 
  FileText 
} from 'lucide-react';

interface AuthPortalsProps {
  activeRole: Role;
  initialMode: 'LOGIN' | 'REGISTER';
  onBackToLanding: () => void;
  onSuccessAuth: (user: { name: string; email: string; role: Role }) => void;
}

export default function AuthPortals({ activeRole, initialMode, onBackToLanding, onSuccessAuth }: AuthPortalsProps) {
  const [localRole, setLocalRole] = useState<Role>(activeRole);
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER'>(initialMode);

  const getPresetEmail = (role: Role) => {
    if (role === 'AUTHOR') return 'author@stanford.edu';
    if (role === 'REVIEWER') return 'reviewer@stanford.edu';
    if (role === 'EDITOR') return 'editor@stanford.edu';
    if (role === 'PUBLISHER') return 'publisher@stanford.edu';
    if (role === 'COORDINATOR') return 'coordinator-triage@jms-journal.org';
    return '';
  };

  const [email, setEmail] = useState(() => {
    if (initialMode === 'LOGIN') {
      return getPresetEmail(activeRole);
    }
    return '';
  });

  const [password, setPassword] = useState(() => {
    if (initialMode === 'LOGIN') return 'password123';
    return '';
  });

  const [confirmPassword, setConfirmPassword] = useState('');

  // Sync props to state dynamically when parent screen triggers
  React.useEffect(() => {
    setLocalRole(activeRole);
    setMode(initialMode);
    if (initialMode === 'LOGIN') {
      setEmail(getPresetEmail(activeRole));
      setPassword('password123');
    } else {
      setEmail('');
      setPassword('');
      setConfirmPassword('');
    }
  }, [activeRole, initialMode]);

  const handleRoleSelect = (role: Role) => {
    setLocalRole(role);
    if (mode === 'LOGIN') {
      setEmail(getPresetEmail(role));
      setPassword('password123');
    } else {
      setEmail('');
      setPassword('');
      setConfirmPassword('');
    }
  };
  
  // Specific Registration Fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [fullName, setFullName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [orcidId, setOrcidId] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [department, setDepartment] = useState('');
  const [country, setCountry] = useState('United States');
  const [expertise, setExpertise] = useState('');
  const [academicQualification, setAcademicQualification] = useState('');
  const [interests, setInterests] = useState('');
  const [experience, setExperience] = useState('3');
  const [designation, setDesignation] = useState('');
  const [editorialExp, setEditorialExp] = useState('');
  
  // Publisher Specific Fields
  const [publisherName, setPublisherName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [organization, setOrganization] = useState('');
  const [address, setAddress] = useState('');
  const [website, setWebsite] = useState('');

  // Simulation state
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Dynamic values matching the mockup theme
  const getRoleColors = () => {
    switch (localRole) {
      case 'AUTHOR':
        return {
          primary: 'emerald',
          bg: 'bg-[#008751]',
          hover: 'hover:bg-[#007043]',
          ring: 'focus:ring-[#008751]',
          border: 'border-slate-200',
          text: 'text-[#008751]',
          labelText: 'text-[#008751]',
          labelBg: 'bg-[#f0fdf4] border border-[#bbf7d0]/60',
          label: 'Author Submission Portal',
          focusBorder: 'focus:border-[#008751] focus:ring-[#008751]',
        };
      case 'REVIEWER':
        return {
          primary: 'emerald',
          bg: 'bg-[#008751]',
          hover: 'hover:bg-[#007043]',
          ring: 'focus:ring-[#008751]',
          border: 'border-slate-200',
          text: 'text-[#008751]',
          labelText: 'text-[#008751]',
          labelBg: 'bg-[#f0fdf4] border border-[#bbf7d0]/60',
          label: 'Reviewer Assessment Hub',
          focusBorder: 'focus:border-[#008751] focus:ring-[#008751]',
        };
      case 'EDITOR':
        return {
          primary: 'emerald',
          bg: 'bg-[#008751]',
          hover: 'hover:bg-[#007043]',
          ring: 'focus:ring-[#008751]',
          border: 'border-slate-200',
          text: 'text-[#008751]',
          labelText: 'text-[#008751]',
          labelBg: 'bg-[#f0fdf4] border border-[#bbf7d0]/60',
          label: 'Editor-In-Chief Central',
          focusBorder: 'focus:border-[#008751] focus:ring-[#008751]',
        };
      case 'PUBLISHER':
        return {
          primary: 'emerald',
          bg: 'bg-[#008751]',
          hover: 'hover:bg-[#007043]',
          ring: 'focus:ring-[#008751]',
          border: 'border-slate-200',
          text: 'text-[#008751]',
          labelText: 'text-[#008751]',
          labelBg: 'bg-[#f0fdf4] border border-[#bbf7d0]/60',
          label: 'Publisher Ingestion Console',
          focusBorder: 'focus:border-[#008751] focus:ring-[#008751]',
        };
      case 'COORDINATOR':
        return {
          primary: 'black',
          bg: 'bg-black',
          hover: 'hover:bg-slate-900',
          ring: 'focus:ring-black',
          border: 'border-black',
          text: 'text-black',
          labelText: 'text-black',
          labelBg: 'bg-slate-50 border border-black',
          label: 'Project Coordinator Console',
          focusBorder: 'focus:border-black focus:ring-black',
        };
      default:
        return {
          primary: 'emerald',
          bg: 'bg-[#008751]',
          hover: 'hover:bg-[#007043]',
          ring: 'focus:ring-[#008751]',
          border: 'border-slate-200',
          text: 'text-[#008751]',
          labelText: 'text-[#008751]',
          labelBg: 'bg-[#f0fdf4] border border-[#bbf7d0]/60',
          label: 'Portal Hub',
          focusBorder: 'focus:border-[#008751] focus:ring-[#008751]',
        };
    }
  };

  const colors = getRoleColors();

  const labelStyle = "block text-slate-700 font-sans font-medium mb-0.5 text-xs sm:text-sm leading-tight";
  const inputStyle = `w-full bg-white text-slate-900 placeholder-slate-400 border border-emerald-100/80 rounded-lg pl-9 pr-3 py-1.5 focus:ring-2 focus:outline-none ${colors.focusBorder} font-sans font-semibold text-sm transition-all duration-200 shadow-xs`;
  const textareaStyle = `w-full bg-white text-slate-900 placeholder-slate-400 border border-emerald-100/80 rounded-lg pl-9 pr-3 py-1.5 focus:ring-2 focus:outline-none ${colors.focusBorder} font-sans font-semibold text-sm transition-all duration-200 shadow-xs`;
  const selectStyle = `w-full bg-white text-slate-900 border border-emerald-100/80 rounded-lg pl-9 pr-9 py-1.5 focus:ring-2 focus:outline-none ${colors.focusBorder} font-sans font-semibold text-sm transition-all duration-200 shadow-xs appearance-none`;

  const handleSimulateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    
    // Simulate validators:
    if (mode === 'REGISTER') {
      if (!email) {
        setErrorMsg('First-class email identifier required.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('Confirm Password coordinates mismatch.');
        return;
      }
      if (password.length < 6) {
        setErrorMsg('Credential security requires at least 6 characters.');
        return;
      }
    } else {
      if (!email || !password) {
        setErrorMsg('Email and Password vectors must be defined.');
        return;
      }
    }

    setLoading(true);
    
    // Compute registered user full name
    let computedName = 'Simulated User';
    if (localRole === 'AUTHOR') {
      computedName = firstName ? `${firstName} ${lastName}` : 'Ada Lovelace';
    } else if (localRole === 'PUBLISHER') {
      computedName = contactPerson || publisherName || 'Simulated Publisher';
    } else {
      computedName = fullName || 'Simulated Staff';
    }

    try {
      if (mode === 'REGISTER') {
        const meta = {
          first_name: firstName,
          last_name: lastName,
          orcid_id: orcidId,
          affiliation: affiliation,
          department: department,
          country: country,
          expertise: expertise,
          academic_qualification: academicQualification,
          interests: interests,
          experience: experience,
          designation: designation,
          editorial_exp: editorialExp,
          publisher_name: publisherName,
          contact_person: contactPerson,
          organization: organization,
          address: address,
          website: website,
          mobile_number: mobileNumber
        };

        const res = await registerSupabaseUser(email, password, computedName, localRole, meta);
        setSuccessMsg(`SUCCESS: Account registered for ${computedName} in Supabase Auth!`);
        setTimeout(() => {
          onSuccessAuth({
            name: computedName,
            email: email,
            role: localRole
          });
        }, 1500);
      } else {
        const authUser = await loginSupabaseUser(email, password);
        setSuccessMsg(`SUCCESS: Authenticated via Supabase Auth! Redirecting...`);
        setTimeout(() => {
          onSuccessAuth({
            name: authUser.name,
            email: authUser.email,
            role: localRole
          });
        }, 1500);
      }
    } catch (err: any) {
      console.error("[Supabase Auth Error Captured in AuthPortals]:", err);
      // Display the actual, unhidden error details to the user
      setErrorMsg(`Authentication Failure: ${err.message || err.toString() || 'Unknown error occurred.'}`);
    } finally {
      setLoading(false);
    }
  };

  const simulateOAuth = (provider: 'GOOGLE' | 'ORCID') => {
    setErrorMsg('');
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      const computedName = localRole === 'AUTHOR' ? 'Dr. Ada Lovelace' : 
                           localRole === 'REVIEWER' ? 'Prof. Grace Hopper' : 
                           localRole === 'EDITOR' ? 'Dr. Alan Turing' : 
                           localRole === 'COORDINATOR' ? 'Sarah Jenkins, MSc' : 'Digital Press Center';
      const computedEmail = localRole === 'AUTHOR' ? 'ada@computing.org' : 
                            localRole === 'REVIEWER' ? 'grace@cober.org' : 
                            localRole === 'EDITOR' ? 'turing@enigma.labs' : 
                            localRole === 'COORDINATOR' ? 'coordinator-triage@jms-journal.org' : 'press@jms-digital.org';
      
      setSuccessMsg(`SUCCESS: Connected OAuth from ${provider}. Resolved metadata parameters for ${computedName}.`);
      setTimeout(() => {
        onSuccessAuth({
          name: computedName,
          email: computedEmail,
          role: localRole
        });
      }, 1500);
    }, 1000);
  };

  return (
    <div id="auth-portal-screen" className="min-h-screen md:h-screen w-full bg-white flex flex-col md:flex-row relative overflow-y-auto md:overflow-hidden animate-fade-in">
      
      <button
        id="btn-auth-back-to-landing"
        onClick={onBackToLanding}
        className="absolute top-4 left-4 z-20 flex items-center gap-1.5 text-xs text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 px-3 py-2 rounded-lg transition-all duration-150 font-bold cursor-pointer shadow-xs"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Home
      </button>

      {/* Left Decorative Sidebar - Green */}
      <div id="auth-decorative-sidebar" className="w-full md:w-[42%] bg-[#1a4038] text-white p-6 md:p-8 lg:p-10 flex flex-col justify-center relative md:h-screen shrink-0 md:overflow-hidden select-none">
        <div className="absolute inset-0 bg-[radial-gradient(#10b981_0.7px,transparent_0.7px)] [background-size:24px_24px] opacity-10 pointer-events-none z-0" />
        <div className="absolute -left-12 -top-12 w-64 h-64 bg-emerald-800/20 rounded-full blur-2xl pointer-events-none z-0" />
        
        <div className="relative z-10 space-y-6 my-auto max-w-xl md:ml-auto w-full">
          <div className="space-y-3">
            <h2 className="text-2xl lg:text-3xl font-sans font-extrabold tracking-tight text-white leading-tight">
              Unlock your growth potential with our insights
            </h2>
            <p className="text-emerald-100/90 text-xs sm:text-sm leading-relaxed font-semibold">
              Sign up to get reports, industry news and resources for your business in your inbox—sourced from Euromonitor experts and our market research knowledge hub, Passport.
            </p>
            <p className="text-emerald-100/90 text-xs sm:text-sm leading-relaxed font-semibold">
              Each month, you can expect a curated roundup of market, consumer and economic insights. Our goal: to help you navigate challenges and explore new pathways to growth.
            </p>
          </div>

          <div className="space-y-3 pt-4 border-t border-emerald-800/40">
            <h3 className="text-lg lg:text-xl font-sans font-extrabold tracking-tight text-white">
              Why Tulitics?
            </h3>
            <ul className="space-y-2 text-xs sm:text-sm text-emerald-100/90 list-none">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 shrink-0 mt-0.5">•</span>
                <span>Stay updated on industry trends, consumer preferences and economic shifts</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 shrink-0 mt-0.5">•</span>
                <span>Access free reports and strategic resources from our research experts</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 shrink-0 mt-0.5">•</span>
                <span>Get insights and data to inspire your strategy</span>
              </li>
            </ul>
            <p className="text-emerald-200/80 text-[11px] sm:text-xs italic pt-1">
              Whatever stage you’re at in your organisation, we’ll help you stay in the know.
            </p>
          </div>
        </div>
      </div>

      {/* Right Form Side - White */}
      <div className="w-full md:w-[58%] bg-white p-4 md:p-6 lg:p-8 flex flex-col relative overflow-y-auto md:overflow-y-hidden md:h-screen shrink-0">
        <div className="max-w-lg w-full mx-auto my-auto space-y-3 py-2 md:py-4">
          {/* Top Segmented Tab Control */}
          <div className="flex bg-slate-100/85 p-1 rounded-xl w-full font-sans">
            <button
              type="button"
              onClick={() => {
                setMode('REGISTER');
                setEmail('');
                setPassword('');
                setConfirmPassword('');
              }}
              className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold text-center transition-all duration-200 cursor-pointer ${
                mode === 'REGISTER'
                  ? 'bg-[#008751] text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              Sign Up / Register
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('LOGIN');
                setEmail(getPresetEmail(localRole));
                setPassword('password123');
              }}
              className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold text-center transition-all duration-200 cursor-pointer ${
                mode === 'LOGIN'
                  ? 'bg-[#008751] text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              Sign In / Login
            </button>
          </div>

          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div>
              <h2 className="font-sans font-black text-lg text-slate-900 tracking-tight leading-none">
                {mode === 'LOGIN' ? 'Separate Secure Login' : 'Independent Portal Sign Up'}
              </h2>
              <p className="text-xs text-slate-500 font-semibold mt-1">
                {mode === 'LOGIN' 
                  ? `Enter credentials to access your persistent journal dashboard.` 
                  : `Build a peer profile index associated with our multi-tenant database.`}
              </p>
            </div>
            <span className="bg-[#f0fdf4] border border-[#bbf7d0] text-[#155e42] font-sans text-[11px] px-2.5 py-1 rounded-md font-normal capitalize shrink-0 self-start shadow-xs">
              {localRole.toLowerCase()}
            </span>
          </div>

          {/* Alerts Banner */}
          {errorMsg && (
            <div id="auth-err-banner" className="bg-red-50 border border-red-200/60 text-red-800 p-3.5 rounded-xl text-xs flex items-start gap-2.5 animate-fade-in font-semibold">
              <AlertCircle className="w-4.5 h-4.5 shrink-0 text-red-500 stroke-[2.2]" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div id="auth-success-banner" className="bg-emerald-50 border border-[#bbf7d0] text-emerald-900 p-3.5 rounded-xl text-xs flex items-start gap-2.5 animate-fade-in font-semibold">
              <CheckCircle className="w-4.5 h-4.5 shrink-0 text-[#008751] stroke-[2.2]" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleSimulateSubmit} className="space-y-3">
            
            {/* REGISTER PORTAL FORMS */}
            {mode === 'REGISTER' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                
                {/* AUTHOR SPECIFIC REGISTRATION */}
                {localRole === 'AUTHOR' && (
                  <>
                    <div>
                      <label className={labelStyle}>First Name</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <User className="absolute left-3 w-4 h-4 text-slate-400" />
                        <input
                          id="reg-author-firstname"
                          type="text"
                          required
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="Ada"
                          className={inputStyle}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelStyle}>Last Name</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <User className="absolute left-3 w-4 h-4 text-slate-400" />
                        <input
                          id="reg-author-lastname"
                          type="text"
                          required
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="Lovelace"
                          className={inputStyle}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelStyle}>ORCID ID ID</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <div className="absolute left-3 w-4.5 h-4.5 rounded-full bg-[#a6e22e] text-white flex items-center justify-center font-bold text-[8px] select-none">iD</div>
                        <input
                          type="text"
                          value={orcidId}
                          onChange={(e) => setOrcidId(e.target.value)}
                          placeholder="0000-0002-1825-0097"
                          className={inputStyle}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelStyle}>Primary Affiliation</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <Building className="absolute left-3 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          required
                          value={affiliation}
                          onChange={(e) => setAffiliation(e.target.value)}
                          placeholder="Stanford University"
                          className={inputStyle}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelStyle}>Department</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <Sliders className="absolute left-3 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={department}
                          onChange={(e) => setDepartment(e.target.value)}
                          placeholder="Computer Science Labs"
                          className={inputStyle}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelStyle}>Country</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <Globe className="absolute left-3 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={country}
                          onChange={(e) => setCountry(e.target.value)}
                          className={inputStyle}
                        />
                      </div>
                    </div>
                     <div>
                       <label className={labelStyle}>Mobile Contact Number</label>
                       <div className="relative flex items-center shadow-xs rounded-lg">
                         <Phone className="absolute left-3 w-4 h-4 text-slate-400" />
                         <input
                           type="text"
                           value={mobileNumber}
                           onChange={(e) => setMobileNumber(e.target.value)}
                           placeholder="+1 (555) 0192-384"
                           className={inputStyle}
                         />
                       </div>
                     </div>
                  </>
                )}

                {/* REVIEWER SPECIFIC REGISTRATION */}
                {localRole === 'REVIEWER' && (
                  <>
                    <div className="sm:col-span-2">
                      <label className={labelStyle}>Full Name (With Titles)</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <User className="absolute left-3 w-4 h-4 text-slate-400" />
                        <input
                          id="reg-reviewer-fullname"
                          type="text"
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="Prof. Grace Hopper"
                          className={inputStyle}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelStyle}>Academic Affiliation</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <Building className="absolute left-3 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          required
                          value={affiliation}
                          onChange={(e) => setAffiliation(e.target.value)}
                          placeholder="Navy Compiler Division"
                          className={inputStyle}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelStyle}>ORCID ID ID</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <div className="absolute left-3 w-4.5 h-4.5 rounded-full bg-[#a6e22e] text-white flex items-center justify-center font-bold text-[8px] select-none">iD</div>
                        <input
                          type="text"
                          value={orcidId}
                          onChange={(e) => setOrcidId(e.target.value)}
                          placeholder="0000-0001-9284-0012"
                          className={inputStyle}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelStyle}>Expertise Areas (Comma Sep)</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <Sliders className="absolute left-3 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          required
                          value={expertise}
                          onChange={(e) => setExpertise(e.target.value)}
                          placeholder="Biosensors, medical imaging, chest CT algorithms"
                          className={inputStyle}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelStyle}>Academic Qualification</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <Award className="absolute left-3 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={academicQualification}
                          onChange={(e) => setAcademicQualification(e.target.value)}
                          placeholder="Ph.D. in Biological Informatics"
                          className={inputStyle}
                        />
                      </div>
                    </div>
                     <div>
                        <label className={labelStyle}>Academic / Research Interests</label>
                        <div className="relative flex items-center shadow-xs rounded-lg">
                          <BookOpen className="absolute left-3 w-4 h-4 text-slate-400" />
                          <input
                           type="text"
                           value={interests}
                           onChange={(e) => setInterests(e.target.value)}
                           placeholder="Optimistic consistency, thread synchronicity..."
                           className={inputStyle}
                          />
                        </div>
                     </div>
                    <div>
                      <label className={labelStyle}>Years of Reviewing Experience</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <Sliders className="absolute left-3 w-4 h-4 text-slate-400" />
                        <select 
                          value={experience} 
                          onChange={(e) => setExperience(e.target.value)}
                          className={selectStyle}
                        >
                          <option value="1">1 to 2 Years</option>
                          <option value="3">3 to 5 Years</option>
                          <option value="7">7+ Years of Tenure</option>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                          <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className={labelStyle}>Mobile Contact</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <Phone className="absolute left-3 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={mobileNumber}
                          onChange={(e) => setMobileNumber(e.target.value)}
                          placeholder="+1 (415) 880-1284"
                          className={inputStyle}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* EDITOR SPECIFIC REGISTRATION */}
                {localRole === 'EDITOR' && (
                  <>
                    <div className="sm:col-span-2">
                      <label className={labelStyle}>Full Name</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <User className="absolute left-3 w-4 h-4 text-slate-400" />
                        <input
                          id="reg-editor-fullname"
                          type="text"
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="Dr. Alan Turing"
                          className={inputStyle}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelStyle}>Host Institution</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <Building className="absolute left-3 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          required
                          value={affiliation}
                          onChange={(e) => setAffiliation(e.target.value)}
                          placeholder="Princeton IAS"
                          className={inputStyle}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelStyle}>Editorial Experience (Years)</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <Award className="absolute left-3 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={editorialExp}
                          onChange={(e) => setEditorialExp(e.target.value)}
                          placeholder="8 Years with Journal of Logic"
                          className={inputStyle}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelStyle}>Designation Designation</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <Sliders className="absolute left-3 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={designation}
                          onChange={(e) => setDesignation(e.target.value)}
                          placeholder="Associate Dean of Computer Math"
                          className={inputStyle}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelStyle}>Academic Areas of Expertise</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <FileText className="absolute left-3 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={expertise}
                          onChange={(e) => setExpertise(e.target.value)}
                          placeholder="Decentralized models, crypto, logic gates"
                          className={inputStyle}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* COORDINATOR SPECIFIC REGISTRATION */}
                {localRole === 'COORDINATOR' && (
                  <>
                    <div className="sm:col-span-2">
                      <label className={labelStyle}>Full Name</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <User className="absolute left-3 w-4 h-4 text-slate-400" />
                        <input
                          id="reg-coordinator-fullname"
                          type="text"
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="Sarah Jenkins, MSc"
                          className={inputStyle}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelStyle}>Department / Unit</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <Building className="absolute left-3 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          required
                          value={department}
                          onChange={(e) => setDepartment(e.target.value)}
                          placeholder="Editorial & Metadata Systems"
                          className={inputStyle}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelStyle}>Technical Responsibility</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <Sliders className="absolute left-3 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={expertise}
                          onChange={(e) => setExpertise(e.target.value)}
                          placeholder="Galley Proofing, DOI Minting"
                          className={inputStyle}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* PUBLISHER SPECIFIC REGISTRATION */}
                {localRole === 'PUBLISHER' && (
                  <>
                    <div className="sm:col-span-2">
                      <label className={labelStyle}>Publisher Company Name</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <Building className="absolute left-3 w-4 h-4 text-slate-400" />
                        <input
                          id="reg-publisher-name"
                          type="text"
                          required
                          value={publisherName}
                          onChange={(e) => setPublisherName(e.target.value)}
                          placeholder="Digital Systems Press, Inc"
                          className={inputStyle}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelStyle}>Contact Person Name</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <User className="absolute left-3 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          required
                          value={contactPerson}
                          onChange={(e) => setContactPerson(e.target.value)}
                          placeholder="Clara Barton"
                          className={inputStyle}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={labelStyle}>Main Website URL</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <Globe className="absolute left-3 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={website}
                          onChange={(e) => setWebsite(e.target.value)}
                          placeholder="https://jms-digital-press.org"
                          className={inputStyle}
                        />
                      </div>
                    </div>
                     <div>
                       <label className={labelStyle}>Address & Postal Headquarters</label>
                       <div className="relative flex items-center shadow-xs rounded-lg">
                         <FileText className="absolute left-3 w-4 h-4 text-slate-400" />
                         <input
                           type="text"
                           value={address}
                           onChange={(e) => setAddress(e.target.value)}
                           placeholder="Building 12, Broad Research Lab Park"
                           className={inputStyle}
                         />
                       </div>
                     </div>
                  </>
                )}

              </div>
            )}

            {/* SHARED GENERAL EMAIL / PASSWORD FIELDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm pt-3 border-t border-dashed border-slate-100">
              <div className="sm:col-span-2">
                <label className={labelStyle}>Email Address Identity</label>
                <div className="relative flex items-center shadow-xs rounded-lg">
                  <Mail className="absolute left-3 w-4 h-4 text-slate-400" />
                  <input
                    id="input-auth-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@university-journal.org"
                    className={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label className={labelStyle}>Password</label>
                <div className="relative flex items-center shadow-xs rounded-lg">
                  <Key className="absolute left-3 w-4 h-4 text-slate-400" />
                  <input
                    id="input-auth-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className={inputStyle}
                  />
                </div>
              </div>

              {mode === 'REGISTER' && (
                <div>
                  <label className={labelStyle}>Confirm Password</label>
                  <div className="relative flex items-center shadow-xs rounded-lg">
                    <Key className="absolute left-3 w-4 h-4 text-slate-400" />
                    <input
                      id="input-auth-confirm-password"
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className={inputStyle}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* SELECT ROLE TO LOGIN/REGISTER SECTION */}
            <div className="space-y-1.5 py-1">
              <label className="block text-[10px] font-sans font-medium uppercase tracking-wider text-slate-500 select-none">
                Select Portal Access Gate
              </label>
              <div className="grid grid-cols-5 gap-1">
                {[
                  { role: 'AUTHOR' as Role, label: 'Author' },
                  { role: 'REVIEWER' as Role, label: 'Reviewer' },
                  { role: 'EDITOR' as Role, label: 'Editor' },
                  { role: 'PUBLISHER' as Role, label: 'Publisher' },
                  { role: 'COORDINATOR' as Role, label: 'Coordinator' }
                ].map(({ role, label }) => {
                  const isSelected = localRole === role;
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => handleRoleSelect(role)}
                      className={`flex items-center justify-center py-2 px-0.5 rounded-lg border transition-all duration-150 cursor-pointer text-center select-none ${
                        isSelected
                          ? 'bg-[#008751] border-[#008751] text-white shadow-sm font-medium'
                          : 'bg-white border-slate-200 hover:border-slate-300 text-slate-600 hover:bg-slate-50 font-normal'
                      }`}
                    >
                      <span className="font-sans text-[11px] sm:text-xs block leading-none">
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* FORGOT PASSWORD GATES */}
            {mode === 'LOGIN' && (
              <div className="flex items-center justify-between text-sm pt-1">
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); alert("Dispatching simulated password reset mail guidelines to: " + (email || "your inbox")); }}
                  className="text-[#008751] hover:text-[#007043] font-bold transition-colors hover:underline"
                >
                  Forgot Password?
                </a>
              </div>
            )}

            {/* SUBMIT ACTION CONTROLS */}
            <button
              id="btn-auth-submit"
              type="submit"
              disabled={loading}
              className="w-full bg-[#008751] hover:bg-[#007043] text-white font-mono text-xs font-black uppercase tracking-widest py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-all duration-150 cursor-pointer shadow-sm hover:shadow disabled:opacity-75 disabled:cursor-not-allowed mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  {mode === 'LOGIN' ? `Login with Email` : `Register with Email`}
                </>
              )}
            </button>

          </form>

          {/* SIMULATED SOCIAL OAUTH FOR EVERY SYSTEM REGISTRATION */}
          <div className="space-y-2 pt-3 border-t border-slate-100">
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div id="oauth-divider-line" className="w-full border-t border-slate-100"></div>
              </div>
              <span className="relative bg-white px-4 font-mono text-[8px] font-black uppercase tracking-widest text-slate-400 select-none">
                Alternative OAuth Registries
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                id="btn-oauth-google"
                type="button"
                onClick={() => simulateOAuth('GOOGLE')}
                className="flex items-center justify-center gap-2 border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 py-1.5 px-3 rounded-lg text-xs font-bold cursor-pointer transition-all shadow-xs"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.66 1.54 14.98 1 12 1 7.35 1 3.37 3.67 1.39 7.56l3.85 2.99c.92-2.77 3.51-4.51 6.76-4.51z"/>
                  <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.35H12v4.51h6.46c-.29 1.48-1.14 2.73-2.4 3.58l3.74 2.9c2.19-2.02 3.49-4.99 3.49-8.64z"/>
                  <path fill="#FBBC05" d="M5.24 14.59c-.25-.75-.39-1.55-.39-2.39s.14-1.64.39-2.39L1.39 6.82C.5 8.62 0 10.62 0 12.7c0 2.08.5 4.08 1.39 5.88l3.85-2.99z"/>
                  <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.9l-3.74-2.9c-1.1.74-2.52 1.18-4.22 1.18-3.25 0-5.84-1.74-6.76-4.51L1.39 16.8C3.37 20.69 7.35 23 12 23z"/>
                </svg>
                Continue with Google
              </button>

              {localRole !== 'PUBLISHER' ? (
                <button
                  id="btn-oauth-orcid"
                  type="button"
                  onClick={() => simulateOAuth('ORCID')}
                  className="flex items-center justify-center gap-2 border border-[#bbf7d0] bg-[#f0fdf4] hover:bg-[#e6f4ea] text-[#165b33] py-1.5 px-3 rounded-lg text-xs font-bold cursor-pointer transition-all shadow-xs"
                >
                  <span className="w-4 h-4 rounded-full bg-[#a6e22e] text-white flex items-center justify-center font-bold text-[9px] select-none">iD</span>
                  Continue with ORCID ID
                </button>
              ) : (
                <div className="bg-slate-50 border border-dashed border-slate-200 text-slate-400 p-1.5 text-center rounded-lg font-mono text-[8px] flex items-center justify-center font-bold">
                  ORCID omitted for Publisher
                </div>
              )}
            </div>
          </div>

          {/* TOGGLE GATES SCREEN */}
          <div className="text-center pt-3 text-sm border-t border-slate-100">
            {mode === 'LOGIN' ? (
              <p className="text-slate-500 font-semibold text-xs">
                Don't have a registered account?{' '}
                <button
                  id="btn-toggle-auth-register"
                  type="button"
                  onClick={() => {
                    setMode('REGISTER');
                    setEmail('');
                    setPassword('');
                    setConfirmPassword('');
                  }}
                  className="font-black underline text-[#008751] hover:text-[#007043] transition-colors cursor-pointer"
                >
                  Create a new registration profile
                </button>
              </p>
            ) : (
              <p className="text-slate-500 font-semibold text-xs">
                Already registered under JMS?{' '}
                <button
                  id="btn-toggle-auth-login"
                  type="button"
                  onClick={() => {
                    setMode('LOGIN');
                    setEmail(getPresetEmail(localRole));
                    setPassword('password123');
                  }}
                  className="font-black underline text-[#008751] hover:text-[#007043] transition-colors cursor-pointer"
                >
                  Login to your active profile
                </button>
              </p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
