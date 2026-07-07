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
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
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
    switch (activeRole) {
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

  const labelStyle = "block text-emerald-950 font-sans font-extrabold mb-2 uppercase tracking-wide text-sm sm:text-base leading-tight";
  const inputStyle = `w-full bg-white text-slate-900 placeholder-slate-400 border border-emerald-100/80 rounded-xl pl-10 pr-4 py-3 focus:ring-2 focus:outline-none ${colors.focusBorder} font-sans font-semibold text-base transition-all duration-200 shadow-xs`;
  const textareaStyle = `w-full bg-white text-slate-900 placeholder-slate-400 border border-emerald-100/80 rounded-xl pl-10 pr-4 py-3 focus:ring-2 focus:outline-none ${colors.focusBorder} font-sans font-semibold text-base transition-all duration-200 shadow-xs`;
  const selectStyle = `w-full bg-white text-slate-900 border border-emerald-100/80 rounded-xl pl-10 pr-10 py-3 focus:ring-2 focus:outline-none ${colors.focusBorder} font-sans font-semibold text-base transition-all duration-200 shadow-xs appearance-none`;

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
    if (activeRole === 'AUTHOR') {
      computedName = firstName ? `${firstName} ${lastName}` : 'Ada Lovelace';
    } else if (activeRole === 'PUBLISHER') {
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

        const res = await registerSupabaseUser(email, password, computedName, activeRole, meta);
        setSuccessMsg(`SUCCESS: Account registered for ${computedName} in Supabase Auth!`);
        setTimeout(() => {
          onSuccessAuth({
            name: computedName,
            email: email,
            role: activeRole
          });
        }, 1500);
      } else {
        const authUser = await loginSupabaseUser(email, password);
        setSuccessMsg(`SUCCESS: Authenticated via Supabase Auth! Redirecting...`);
        setTimeout(() => {
          onSuccessAuth({
            name: authUser.name,
            email: authUser.email,
            role: authUser.role
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
      const computedName = activeRole === 'AUTHOR' ? 'Dr. Ada Lovelace' : 
                           activeRole === 'REVIEWER' ? 'Prof. Grace Hopper' : 
                           activeRole === 'EDITOR' ? 'Dr. Alan Turing' : 
                           activeRole === 'COORDINATOR' ? 'Sarah Jenkins, MSc' : 'Digital Press Center';
      const computedEmail = activeRole === 'AUTHOR' ? 'ada@computing.org' : 
                            activeRole === 'REVIEWER' ? 'grace@cober.org' : 
                            activeRole === 'EDITOR' ? 'turing@enigma.labs' : 
                            activeRole === 'COORDINATOR' ? 'coordinator-triage@jms-journal.org' : 'press@jms-digital.org';
      
      setSuccessMsg(`SUCCESS: Connected OAuth from ${provider}. Resolved metadata parameters for ${computedName}.`);
      setTimeout(() => {
        onSuccessAuth({
          name: computedName,
          email: computedEmail,
          role: activeRole
        });
      }, 1500);
    }, 1000);
  };

  return (
    <div id="auth-portal-screen" className="min-h-screen w-full bg-[#f4faf7] px-4 sm:px-6 py-12 md:py-20 flex flex-col items-center justify-center relative">
      <div className="absolute inset-0 bg-[radial-gradient(#10b981_0.7px,transparent_0.7px)] [background-size:24px_24px] opacity-[0.04] pointer-events-none" />
      
      <button
        id="btn-auth-back-to-landing"
        onClick={onBackToLanding}
        className="self-start max-w-4xl mx-auto w-full flex items-center gap-2 text-xs text-[#008751] hover:text-[#007043] bg-white hover:bg-slate-50 border border-slate-100 px-4 py-2.5 rounded-xl transition-all duration-150 mb-6 font-bold cursor-pointer shadow-[0_4px_12px_rgba(4,120,87,0.02)]"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Journal Homepage
      </button>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_15px_50px_rgba(4,120,87,0.06)] overflow-hidden grid grid-cols-1 md:grid-cols-12 max-w-4xl w-full animate-fade-in relative z-10">
        
        {/* Left Decorative Sidebar */}
        <div id="auth-decorative-sidebar" className="md:col-span-4 bg-gradient-to-b from-[#004d2b] to-[#012515] text-white p-8 sm:p-10 flex flex-col justify-between relative overflow-hidden select-none min-h-[320px] md:min-h-[500px]">
          <div className="absolute inset-0 bg-[radial-gradient(#10b981_0.7px,transparent_0.7px)] [background-size:24px_24px] opacity-15 pointer-events-none z-0" />
          <div className="absolute -left-12 -top-12 w-64 h-64 bg-emerald-400/10 rounded-full blur-2xl pointer-events-none z-0" />
          
          <div className="relative z-10 space-y-6">
            <TuliticsLogo iconSize={32} showText={true} textColorClass="text-white" subTitle="ENTERPRISE SYSTEM" usePng={true} />
            
            <div className="pt-2">
              <span className="bg-white/10 border border-white/20 text-[#34d399] font-mono font-black tracking-widest uppercase text-xs px-3 py-1 rounded-lg inline-flex items-center gap-1.5">
                ✦ {activeRole} GATES ✦
              </span>
            </div>
            <h3 className="font-sans font-black text-2xl sm:text-3xl tracking-tight text-white leading-tight">
              {colors.label}
            </h3>
            <p className="text-sm text-slate-200 leading-relaxed font-semibold">
              Review and record peer assessments, index DOIs, and dispatch manuscripts downstream on a secure decentralized pipeline.
            </p>
          </div>

          <div className="relative z-10 pt-12 text-xs text-slate-300 font-mono space-y-3 border-t border-white/10 mt-8">
            <div className="flex items-center gap-2 font-black text-[#58ffa4]">
              <Shield className="w-4.5 h-4.5 text-emerald-400 stroke-[2px]" />
              <span>Double-Blind Encryption</span>
            </div>
            <p className="leading-relaxed font-semibold">Your data is secure and protected under multi-tenant enterprise isolation algorithms.</p>
          </div>
        </div>

        {/* Dynamic Form Side */}
        <div className="md:col-span-8 p-8 sm:p-10 space-y-6 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 pb-5">
            <div>
              <h2 className="font-sans font-black text-xl sm:text-2xl text-slate-900 tracking-tight leading-none">
                {mode === 'LOGIN' ? 'Separate Secure Login' : 'Independent Portal Sign Up'}
              </h2>
              <p className="text-sm text-slate-500 font-semibold mt-2">
                {mode === 'LOGIN' 
                  ? `Enter credentials to access your persistent journal dashboard.` 
                  : `Build a peer profile index associated with our multi-tenant database.`}
                {activeRole === 'COORDINATOR' && mode === 'LOGIN' && (
                  <span className="block text-black font-mono text-xs mt-1">
                    Preset demo: <strong className="underline">coordinator-triage@jms-journal.org</strong> (any password)
                  </span>
                )}
              </p>
            </div>
            <span className="bg-[#f0fdf4] border border-[#bbf7d0] text-[#155e42] font-mono text-xs px-3.5 py-1.5 rounded-lg font-black uppercase tracking-widest shrink-0 self-start shadow-xs">
              {activeRole}
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

          <form onSubmit={handleSimulateSubmit} className="space-y-4">
            
            {/* REGISTER PORTAL FORMS */}
            {mode === 'REGISTER' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
                
                {/* AUTHOR SPECIFIC REGISTRATION */}
                {activeRole === 'AUTHOR' && (
                  <>
                    <div>
                      <label className={labelStyle}>First Name</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <User className="absolute left-3.5 w-4 h-4 text-slate-400" />
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
                        <User className="absolute left-3.5 w-4 h-4 text-slate-400" />
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
                        <Building className="absolute left-3.5 w-4 h-4 text-slate-400" />
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
                        <Sliders className="absolute left-3.5 w-4 h-4 text-slate-400" />
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
                        <Globe className="absolute left-3.5 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={country}
                          onChange={(e) => setCountry(e.target.value)}
                          className={inputStyle}
                        />
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelStyle}>Mobile Contact Number</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <Phone className="absolute left-3.5 w-4 h-4 text-slate-400" />
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
                {activeRole === 'REVIEWER' && (
                  <>
                    <div className="sm:col-span-2">
                      <label className={labelStyle}>Full Name (With Titles)</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <User className="absolute left-3.5 w-4 h-4 text-slate-400" />
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
                        <Building className="absolute left-3.5 w-4 h-4 text-slate-400" />
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
                        <Sliders className="absolute left-3.5 w-4 h-4 text-slate-400" />
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
                        <Award className="absolute left-3.5 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={academicQualification}
                          onChange={(e) => setAcademicQualification(e.target.value)}
                          placeholder="Ph.D. in Biological Informatics"
                          className={inputStyle}
                        />
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                       <label className={labelStyle}>Academic / Research Interests</label>
                       <div className="relative flex items-center shadow-xs rounded-lg">
                         <BookOpen className="absolute left-3.5 w-4 h-4 text-slate-400" />
                         <textarea
                          rows={2}
                          value={interests}
                          onChange={(e) => setInterests(e.target.value)}
                          placeholder="Optimistic scheduling consistency, thread synchronicity..."
                          className={textareaStyle}
                         />
                       </div>
                    </div>
                    <div>
                      <label className={labelStyle}>Years of Reviewing Experience</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <Sliders className="absolute left-3.5 w-4 h-4 text-slate-400" />
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
                        <Phone className="absolute left-3.5 w-4 h-4 text-slate-400" />
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
                {activeRole === 'EDITOR' && (
                  <>
                    <div className="sm:col-span-2">
                      <label className={labelStyle}>Full Name</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <User className="absolute left-3.5 w-4 h-4 text-slate-400" />
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
                        <Building className="absolute left-3.5 w-4 h-4 text-slate-400" />
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
                        <Award className="absolute left-3.5 w-4 h-4 text-slate-400" />
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
                        <Sliders className="absolute left-3.5 w-4 h-4 text-slate-400" />
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
                        <FileText className="absolute left-3.5 w-4 h-4 text-slate-400" />
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
                {activeRole === 'COORDINATOR' && (
                  <>
                    <div className="sm:col-span-2">
                      <label className={labelStyle}>Full Name</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <User className="absolute left-3.5 w-4 h-4 text-slate-400" />
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
                        <Building className="absolute left-3.5 w-4 h-4 text-slate-400" />
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
                        <Sliders className="absolute left-3.5 w-4 h-4 text-slate-400" />
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
                {activeRole === 'PUBLISHER' && (
                  <>
                    <div className="sm:col-span-2">
                      <label className={labelStyle}>Publisher Company Name</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <Building className="absolute left-3.5 w-4 h-4 text-slate-400" />
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
                        <User className="absolute left-3.5 w-4 h-4 text-slate-400" />
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
                        <Globe className="absolute left-3.5 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          value={website}
                          onChange={(e) => setWebsite(e.target.value)}
                          placeholder="https://jms-digital-press.org"
                          className={inputStyle}
                        />
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelStyle}>Address & Postal Headquarters</label>
                      <div className="relative flex items-center shadow-xs rounded-lg">
                        <FileText className="absolute left-3.5 w-4 h-4 text-slate-400" />
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm pt-4 border-t border-dashed border-slate-100">
              <div className="sm:col-span-2">
                <label className={labelStyle}>Email Address Identity</label>
                <div className="relative flex items-center shadow-xs rounded-lg">
                  <Mail className="absolute left-3.5 w-4 h-4 text-slate-400" />
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
                  <Key className="absolute left-3.5 w-4 h-4 text-slate-400" />
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
                    <Key className="absolute left-3.5 w-4 h-4 text-slate-400" />
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

            {/* FORGOT PASSWORD GATES */}
            {mode === 'LOGIN' && (
              <div className="flex items-center justify-between text-sm pt-2">
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
              className="w-full bg-[#008751] hover:bg-[#007043] text-white font-mono text-sm font-black uppercase tracking-widest py-4 px-5 rounded-xl flex items-center justify-center gap-2 transition-all duration-150 cursor-pointer shadow-md hover:shadow-lg disabled:opacity-75 disabled:cursor-not-allowed mt-3"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing Transaction...
                </>
              ) : (
                <>
                  {mode === 'LOGIN' ? `Login with Email` : `Register with Email`}
                </>
              )}
            </button>

          </form>

          {/* SIMULATED SOCIAL OAUTH FOR EVERY SYSTEM REGISTRATION */}
          <div className="space-y-4 pt-6 border-t border-slate-100">
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 flex items-center">
                <div id="oauth-divider-line" className="w-full border-t border-slate-100"></div>
              </div>
              <span className="relative bg-white px-4 font-mono text-[9px] font-black uppercase tracking-widest text-slate-400 select-none">
                Alternative OAuth Registries
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <button
                id="btn-oauth-google"
                type="button"
                onClick={() => simulateOAuth('GOOGLE')}
                className="flex items-center justify-center gap-2.5 border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 text-slate-700 py-3 px-4 rounded-xl text-xs font-bold cursor-pointer transition-all shadow-xs"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.66 1.54 14.98 1 12 1 7.35 1 3.37 3.67 1.39 7.56l3.85 2.99c.92-2.77 3.51-4.51 6.76-4.51z"/>
                  <path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.35H12v4.51h6.46c-.29 1.48-1.14 2.73-2.4 3.58l3.74 2.9c2.19-2.02 3.49-4.99 3.49-8.64z"/>
                  <path fill="#FBBC05" d="M5.24 14.59c-.25-.75-.39-1.55-.39-2.39s.14-1.64.39-2.39L1.39 6.82C.5 8.62 0 10.62 0 12.7c0 2.08.5 4.08 1.39 5.88l3.85-2.99z"/>
                  <path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.9l-3.74-2.9c-1.1.74-2.52 1.18-4.22 1.18-3.25 0-5.84-1.74-6.76-4.51L1.39 16.8C3.37 20.69 7.35 23 12 23z"/>
                </svg>
                Continue with Google
              </button>

              {activeRole !== 'PUBLISHER' ? (
                <button
                  id="btn-oauth-orcid"
                  type="button"
                  onClick={() => simulateOAuth('ORCID')}
                  className="flex items-center justify-center gap-2 border border-[#bbf7d0] bg-[#f0fdf4] hover:bg-[#e6f4ea] text-[#165b33] py-3 px-4 rounded-xl text-xs font-bold cursor-pointer transition-all shadow-xs"
                >
                  <span className="w-4 h-4 rounded-full bg-[#a6e22e] text-white flex items-center justify-center font-bold text-[9px] select-none">iD</span>
                  Continue with ORCID ID
                </button>
              ) : (
                <div className="bg-slate-50 border border-dashed border-slate-200 text-slate-400 p-3 text-center rounded-xl font-mono text-[9px] flex items-center justify-center font-bold">
                  ORCID omitted for Publisher role
                </div>
              )}
            </div>
          </div>

          {/* TOGGLE GATES SCREEN */}
          <div className="text-center pt-5 text-sm">
            {mode === 'LOGIN' ? (
              <p className="text-slate-500 font-semibold">
                Don't have a registered account?{' '}
                <button
                  id="btn-toggle-auth-register"
                  onClick={() => setMode('REGISTER')}
                  className="font-bold underline text-[#008751] hover:text-[#007043] transition-colors"
                >
                  Register as {activeRole.charAt(0) + activeRole.slice(1).toLowerCase()}
                </button>
              </p>
            ) : (
              <p className="text-slate-500 font-semibold">
                Already registered under JMS?{' '}
                <button
                  id="btn-toggle-auth-login"
                  onClick={() => setMode('LOGIN')}
                  className="font-bold underline text-[#008751] hover:text-[#007043] transition-colors"
                >
                  Login as {activeRole.charAt(0) + activeRole.slice(1).toLowerCase()}
                </button>
              </p>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
