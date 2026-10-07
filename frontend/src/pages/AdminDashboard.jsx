import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Shield, Download, RefreshCw, Loader2, Users, TrendingUp, AlertTriangle, ArrowLeft } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const ADMIN_KEY_STORAGE = "clbh_admin_key";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem(ADMIN_KEY_STORAGE) || "");
  const adminHeaders = useMemo(() => {
    return adminKey ? { "X-Admin-Key": adminKey } : {};
  }, [adminKey]);

  const loadLeads = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await axios.get(`${API}/admin/leads`, {
        headers: adminHeaders
      });
      setLeads(response.data.leads || []);
      if (adminKey) {
        try { window.localStorage.setItem("clbh_internal", "1"); } catch (e) { /* ignore */ }
      }
    } catch (error) {
      console.error("Error loading leads:", error);
      if (error?.response?.status === 401) {
        toast.error("Admin key required (or incorrect).");
      } else {
        toast.error("Failed to load leads");
      }
    } finally {
      setIsLoading(false);
    }
  }, [adminHeaders, adminKey]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  // Team test entries: hidden by default, never deleted
  const [hideTests, setHideTests] = useState(true);
  const toggleTest = async (lead) => {
    if (!lead.id) return;
    const next = !lead.is_test;
    try {
      await axios.post(`${API}/admin/leads/${lead.id}/test`, { is_test: next }, { headers: adminHeaders });
      setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, is_test: next } : l)));
      toast.success(next ? "Marked as a test entry" : "Marked as a real lead");
      loadFunnel();
    } catch (error) {
      toast.error("Could not update that lead");
    }
  };

  // Checkup funnel: starts, how far people get, completions and emails
  const [funnel, setFunnel] = useState(null);
  const [funnelDays, setFunnelDays] = useState(30);
  const [funnelLoading, setFunnelLoading] = useState(false);
  const loadFunnel = useCallback(async () => {
    setFunnelLoading(true);
    try {
      const response = await axios.get(`${API}/admin/funnel`, {
        params: { days: funnelDays },
        headers: adminHeaders
      });
      setFunnel(response.data);
    } catch (error) {
      console.error("Error loading funnel:", error);
      setFunnel(null);
    } finally {
      setFunnelLoading(false);
    }
  }, [adminHeaders, funnelDays]);

  useEffect(() => {
    loadFunnel();
  }, [loadFunnel]);

  const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
  const funnelQuestions = funnel?.questions || [];
  const trackedStarted = funnel?.tracked_started || 0;
  const biggestDrop = funnelQuestions.reduce(
    (best, q) => (q.stopped_here > (best?.stopped_here || 0) ? q : best),
    null
  );
  const trackingStartLabel = funnel?.tracking_start
    ? new Date(funnel.tracking_start).toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit"
      })
    : "";

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await axios.get(`${API}/admin/leads/export`, {
        responseType: 'blob',
        headers: adminHeaders
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'clbh_leads.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success("Leads exported successfully");
    } catch (error) {
      console.error("Error exporting leads:", error);
      if (error?.response?.status === 401) {
        toast.error("Admin key required (or incorrect).");
      } else {
        toast.error("Failed to export leads");
      }
    } finally {
      setIsExporting(false);
    }
  };

  const getRiskBadge = (riskLevel) => {
    switch (riskLevel) {
      case "green":
        return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Green (Healthy)</Badge>;
      case "yellow":
        return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Yellow (Worth a look)</Badge>;
      case "red":
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Red (Fix now)</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  // Calculate stats
  const testCount = leads.filter(l => l.is_test).length;
  const visibleLeads = hideTests ? leads.filter(l => !l.is_test) : leads;
  const totalLeads = visibleLeads.length;
  const redLeads = visibleLeads.filter(l => l.risk_level === "red").length;
  const yellowLeads = visibleLeads.filter(l => l.risk_level === "yellow").length;
  const greenLeads = visibleLeads.filter(l => l.risk_level === "green").length;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 nav-grid">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center relative z-10">
          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => navigate("/")}
            >
              <img
                src="/clbh-logo.png"
                alt="Clean Legal Bill of Health — A Jeppson Law Product"
                className="h-24 w-auto"
              />
            </div>
            <Badge variant="outline" className="ml-2">Admin</Badge>
          </div>
          <Button 
            variant="ghost"
            onClick={() => navigate("/")}
            className="text-slate-600"
            data-testid="back-to-home-btn"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Site
          </Button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Admin Key */}
        <Card className="border-slate-200 mb-6">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-end gap-3 md:gap-4">
              <div className="flex-1">
                <Label htmlFor="admin-key">Admin Key</Label>
                <Input
                  id="admin-key"
                  type="password"
                  value={adminKey}
                  onChange={(e) => setAdminKey(e.target.value)}
                  placeholder="Enter admin key (if enabled)"
                  className="mt-1"
                  data-testid="admin-key-input"
                />
                <p className="text-xs text-slate-500 mt-2">
                  If the backend has <code>ADMIN_KEY</code> set, this is required to view/export leads.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    sessionStorage.setItem(ADMIN_KEY_STORAGE, adminKey);
                    toast.success("Admin key saved for this session");
                    loadLeads();
                    loadFunnel();
                  }}
                  data-testid="save-admin-key-btn"
                >
                  Save & Refresh
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
                    setAdminKey("");
                    toast.success("Admin key cleared");
                    loadLeads();
                  }}
                  data-testid="clear-admin-key-btn"
                >
                  Clear
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-heading text-2xl md:text-3xl font-bold text-slate-900">
              Lead Dashboard
            </h1>
            <p className="text-slate-600">
              Manage and export your CLBH checkup leads
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline"
              onClick={() => { loadLeads(); loadFunnel(); }}
              disabled={isLoading}
              data-testid="refresh-btn"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button 
              onClick={handleExport}
              disabled={isExporting || leads.length === 0}
              className="bg-slate-900 hover:bg-slate-800"
              data-testid="export-btn"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Export CSV
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="border-slate-200">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 text-slate-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900" data-testid="total-leads">{totalLeads}</p>
                  <p className="text-sm text-slate-500">Total Leads</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-900" data-testid="red-leads">{redLeads}</p>
                  <p className="text-sm text-red-600">High Risk</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-900" data-testid="yellow-leads">{yellowLeads}</p>
                  <p className="text-sm text-amber-600">Medium Risk</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-emerald-200 bg-emerald-50">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
                  <Shield className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-900" data-testid="green-leads">{greenLeads}</p>
                  <p className="text-sm text-emerald-600">Low Risk</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Checkup Funnel */}
        <Card className="border-slate-200 mb-8" data-testid="funnel-panel">
          <CardHeader className="pb-2">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <CardTitle className="font-heading text-xl font-bold text-slate-900">Checkup funnel</CardTitle>
                <p className="text-sm text-slate-500 mt-1">
                  How many people start the checkup, how far they get, and how many finish.
                  {funnel?.excluded_tests > 0 && ` ${funnel.excluded_tests} team test ${funnel.excluded_tests === 1 ? "run is" : "runs are"} left out.`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {[7, 30, 90].map((d) => (
                  <Button
                    key={d}
                    size="sm"
                    variant={funnelDays === d ? "default" : "outline"}
                    className={funnelDays === d ? "bg-slate-900 hover:bg-slate-800" : ""}
                    onClick={() => setFunnelDays(d)}
                    data-testid={`funnel-range-${d}`}
                  >
                    Last {d} days
                  </Button>
                ))}
                <Button size="sm" variant="ghost" onClick={loadFunnel} disabled={funnelLoading} aria-label="Refresh funnel">
                  <RefreshCw className={`w-4 h-4 ${funnelLoading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!funnel ? (
              <p className="text-sm text-slate-500 py-6 text-center">
                {funnelLoading ? "Loading funnel..." : "Funnel data is not available. Check the admin key above."}
              </p>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-xl border border-slate-200 p-4">
                    <p className="text-2xl font-bold text-slate-900" data-testid="funnel-started">{funnel.started}</p>
                    <p className="text-sm text-slate-500">Started the checkup</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-4">
                    <p className="text-2xl font-bold text-slate-900">{funnel.completed}</p>
                    <p className="text-sm text-slate-500">Finished all questions</p>
                    <p className="text-xs text-slate-400 mt-1">{pct(funnel.completed, funnel.started)}% of starts</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-4">
                    <p className="text-2xl font-bold text-slate-900">{funnel.emails}</p>
                    <p className="text-sm text-slate-500">Gave their email</p>
                    <p className="text-xs text-slate-400 mt-1">{pct(funnel.emails, funnel.started)}% of starts</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-4">
                    <p className="text-2xl font-bold text-slate-900">{Math.max(funnel.started - funnel.completed, 0)}</p>
                    <p className="text-sm text-slate-500">Left before finishing</p>
                    <p className="text-xs text-slate-400 mt-1">{pct(funnel.started - funnel.completed, funnel.started)}% of starts</p>
                  </div>
                </div>

                <div>
                  <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-1 mb-3">
                    <h3 className="font-heading font-bold text-slate-900">Where people stop</h3>
                    <p className="text-xs text-slate-400">
                      Counts checkups started since {trackingStartLabel} ({trackedStarted} so far)
                    </p>
                  </div>

                  {trackedStarted === 0 ? (
                    <p className="text-sm text-slate-500 py-4">
                      No checkups have been started since question tracking began. Numbers will appear here as people take the checkup.
                    </p>
                  ) : (
                    <>
                      {biggestDrop && biggestDrop.stopped_here > 0 && (
                        <div className="mb-4 rounded-xl bg-orange-50 border border-orange-200 p-4 text-sm text-slate-700">
                          <span className="font-semibold text-slate-900">Biggest drop-off: Question {biggestDrop.question_number} ({biggestDrop.area_name}).</span>{" "}
                          {biggestDrop.stopped_here} {biggestDrop.stopped_here === 1 ? "person" : "people"} stopped here.
                          <span className="block text-slate-500 mt-1">"{biggestDrop.text}"</span>
                        </div>
                      )}
                      <div className="space-y-1.5">
                        {funnelQuestions.map((q) => {
                          const width = pct(q.reached, trackedStarted);
                          const newArea = (q.question_number - 1) % 4 === 0;
                          return (
                            <div key={q.question_number}>
                              {newArea && (
                                <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase mt-3 mb-1">{q.area_name}</p>
                              )}
                              <div className="flex items-center gap-3 text-sm" title={q.text}>
                                <span className="w-10 flex-shrink-0 text-slate-500">Q{q.question_number}</span>
                                <div className="flex-1 h-5 bg-slate-100 rounded overflow-hidden">
                                  <div className="h-full bg-blue-600 rounded" style={{ width: `${width}%` }} />
                                </div>
                                <span className="w-24 flex-shrink-0 text-right text-slate-700">{q.reached} <span className="text-slate-400">({width}%)</span></span>
                                <span className={`w-28 flex-shrink-0 text-right ${q.stopped_here > 0 ? "text-red-600 font-medium" : "text-slate-300"}`}>
                                  {q.stopped_here > 0 ? `${q.stopped_here} stopped here` : "none stopped"}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center gap-3 text-sm mt-4 pt-3 border-t border-slate-100">
                        <span className="flex-1 text-slate-600">Finished all questions</span>
                        <span className="text-slate-900 font-semibold">{funnel.tracked_completed} ({pct(funnel.tracked_completed, trackedStarted)}%)</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm mt-1">
                        <span className="flex-1 text-slate-600">Gave their email and saw results</span>
                        <span className="text-slate-900 font-semibold">{funnel.tracked_emails} ({pct(funnel.tracked_emails, trackedStarted)}%)</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Leads Table */}
        <Card className="border-slate-200">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <CardTitle className="font-heading text-lg font-semibold text-slate-900">
                All Leads
              </CardTitle>
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hideTests}
                  onChange={(e) => setHideTests(e.target.checked)}
                  className="w-4 h-4"
                  data-testid="hide-tests-toggle"
                />
                Hide test entries ({testCount})
              </label>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Mark your own practice runs as tests. They are hidden and left out of the funnel, never deleted.
              Checkups you take in this browser are marked as tests automatically.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-12 text-center">
                <Loader2 className="w-8 h-8 text-slate-400 animate-spin mx-auto mb-4" />
                <p className="text-slate-600">Loading leads...</p>
              </div>
            ) : leads.length === 0 ? (
              <div className="py-12 text-center">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600">No leads yet</p>
                <p className="text-slate-500 text-sm">Leads will appear here when users complete assessments</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead>Name</TableHead>
                      <TableHead>Business</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Risk Level</TableHead>
                      <TableHead>Modules</TableHead>
                      <TableHead>Situation</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleLeads.map((lead, index) => (
                      <TableRow key={lead.id || index} data-testid={`lead-row-${index}`}>
                        <TableCell className="font-medium">
                          {lead.name || [lead.first_name, lead.last_name].filter(Boolean).join(" ")}
                          {lead.is_test && <Badge variant="outline" className="ml-2 text-xs">Test</Badge>}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{lead.business_name || lead.profile_labels?.industry}</p>
                            <p className="text-sm text-slate-500">
                              {lead.state || [lead.profile_labels?.revenue, lead.profile_labels?.ownership].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-sm">{lead.email}</p>
                            <p className="text-sm text-slate-500">{lead.phone}</p>
                          </div>
                        </TableCell>
                        <TableCell>{getRiskBadge(lead.risk_level)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {lead.modules?.map((module, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {module}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate" title={lead.situation || lead.profile_labels?.concern || ""}>
                          {lead.situation || lead.profile_labels?.concern}
                        </TableCell>
                        <TableCell className="text-slate-500 text-sm">{formatDate(lead.timestamp)}</TableCell>
                        <TableCell>
                          {lead.id && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-xs text-slate-500"
                              onClick={() => toggleTest(lead)}
                              data-testid={`toggle-test-${index}`}
                            >
                              {lead.is_test ? "Not a test" : "Mark as test"}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
