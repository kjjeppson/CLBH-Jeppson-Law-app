import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Shield, Download, RefreshCw, Loader2, Users, TrendingUp, AlertTriangle, ArrowLeft } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    loadLeads();
  }, []);

  const loadLeads = async () => {
    setIsLoading(true);
    try {
      const response = await axios.get(`${API}/admin/leads`);
      setLeads(response.data.leads || []);
    } catch (error) {
      console.error("Error loading leads:", error);
      toast.error("Failed to load leads");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await axios.get(`${API}/admin/leads/export`, {
        responseType: 'blob'
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
      toast.error("Failed to export leads");
    } finally {
      setIsExporting(false);
    }
  };

  const getRiskBadge = (riskLevel) => {
    switch (riskLevel) {
      case "green":
        return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Green</Badge>;
      case "yellow":
        return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Yellow</Badge>;
      case "red":
        return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Red</Badge>;
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
  const totalLeads = leads.length;
  const redLeads = leads.filter(l => l.risk_level === "red").length;
  const yellowLeads = leads.filter(l => l.risk_level === "yellow").length;
  const greenLeads = leads.filter(l => l.risk_level === "green").length;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Shield className="w-8 h-8 text-slate-900" />
            <span className="font-brand text-xl font-bold text-slate-900">
              Jeppsonlaw<span className="text-slate-500">, LLP</span>
            </span>
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
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="font-heading text-2xl md:text-3xl font-bold text-slate-900">
              Lead Dashboard
            </h1>
            <p className="text-slate-600">
              Manage and export your CLBH assessment leads
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline"
              onClick={loadLeads}
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

        {/* Leads Table */}
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="font-heading text-lg font-semibold text-slate-900">
              All Leads
            </CardTitle>
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map((lead, index) => (
                      <TableRow key={lead.id || index} data-testid={`lead-row-${index}`}>
                        <TableCell className="font-medium">{lead.name}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{lead.business_name}</p>
                            <p className="text-sm text-slate-500">{lead.state}</p>
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
                        <TableCell className="max-w-[200px] truncate">{lead.situation}</TableCell>
                        <TableCell className="text-slate-500 text-sm">{formatDate(lead.timestamp)}</TableCell>
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
