import React, { useState, useEffect } from 'react';
import { MessageSquare, AlertCircle, CheckCircle, Clock, Loader } from 'lucide-react';
import { complaintError, complaintStatuses, complaintsV1, type Complaint, type ComplaintStatus } from '../../services/v1/complaints';

const nextStatus: Record<ComplaintStatus, ComplaintStatus[]> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED'],
  IN_PROGRESS: ['RESOLVED'],
  RESOLVED: ['CLOSED'],
  CLOSED: [],
};

export function AdminComplaints() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ComplaintStatus | 'ALL'>('ALL');
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [response, setResponse] = useState('');

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void complaintsV1.list()
      .then(items => { if (active) setComplaints(items); })
      .catch(() => { if (active) setError('Failed to load complaints.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);

  const update = async (id: string, patch: { status?: ComplaintStatus; adminResponse?: string }) => {
    if (pendingId) return false;
    setPendingId(id);
    setError(null);
    try {
      const record = await complaintsV1.update(id, patch);
      setComplaints(previous => previous.map(item => item.id === id ? record : item));
      return true;
    } catch (error) {
      setError(complaintError(error, 'Failed to save the complaint update.'));
      return false;
    } finally {
      setPendingId(null);
    }
  };

  const handleResponseSubmit = async (complaint: Complaint) => {
    if (!response.trim()) {
      setError('Enter a response.');
      return;
    }
    const status = complaint.status === 'OPEN' ? 'IN_PROGRESS' : undefined;
    if (await update(complaint.id, { adminResponse: response, status })) {
      setResponse('');
      setSelectedComplaint(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'OPEN':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case 'IN_PROGRESS':
        return <Clock className="w-5 h-5 text-blue-600" />;
      case 'RESOLVED':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      default:
        return null;
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'bg-yellow-100 text-yellow-800';
      case 'IN_PROGRESS':
        return 'bg-blue-100 text-blue-800';
      case 'RESOLVED':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const stats = [
    { label: 'Total', value: complaints.length, color: 'bg-gray-500' },
    { label: 'Open', value: complaints.filter((c) => c.status === 'OPEN').length, color: 'bg-yellow-500' },
    { label: 'In Progress', value: complaints.filter((c) => c.status === 'IN_PROGRESS').length, color: 'bg-blue-500' },
    { label: 'Resolved', value: complaints.filter((c) => c.status === 'RESOLVED').length, color: 'bg-green-500' },
  ];

  const visible = filter === 'ALL' ? complaints : complaints.filter(item => item.status === filter);

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <MessageSquare className="w-8 h-8 text-red-600" />
            <h1 className="text-3xl font-bold text-gray-800">Complaints & Feedback</h1>
          </div>
          <p className="text-gray-600">Manage student complaints and feedback</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {stats.map((stat) => (
            <div key={stat.label} className={`${stat.color} text-white rounded-lg p-4`}>
              <p className="text-sm opacity-90">{stat.label}</p>
              <p className="text-3xl font-bold">{stat.value}</p>
            </div>
          ))}
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2 mb-6">
            <AlertCircle className="w-5 h-5" />
            {error}
            <button type="button" onClick={() => setReload(n => n + 1)} className="ml-auto underline">Refresh</button>
          </div>
        )}

        {/* Filter */}
        <div className="mb-6 flex gap-2 flex-wrap">
          {(['ALL', ...Object.keys(complaintStatuses)] as (ComplaintStatus | 'ALL')[]).map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)} aria-pressed={filter === status}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                filter === status
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {status === 'ALL' ? 'All' : complaintStatuses[status]}
            </button>
          ))}
        </div>

        {/* Complaints List */}
        {loading ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <Loader className="w-12 h-12 text-blue-400 mx-auto animate-spin mb-3" />
            <p className="text-gray-600">Loading complaints...</p>
          </div>
        ) : visible.length > 0 ? (
          <div className="space-y-4">
            {visible.map((complaint) => (
              <div key={complaint.id} className="bg-white rounded-lg p-4 hover:shadow-lg transition-shadow">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {getStatusIcon(complaint.status)}
                      <h3 className="text-lg font-semibold text-gray-800">
                        {complaint.title}
                      </h3>
                    </div>
                    <p className="text-sm text-gray-600">
                      From: <span className="font-semibold">{complaint.studentName}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(complaint.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusBg(complaint.status)} text-center`}>
                      {complaintStatuses[complaint.status]}
                    </span>

                    {nextStatus[complaint.status].length > 0 && (
                      <select
                        value={complaint.status}
                        onChange={(e) => void update(complaint.id, { status: e.target.value as ComplaintStatus })}
                        aria-label={`Status for ${complaint.title}`} disabled={pendingId !== null}
                        className="px-3 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value={complaint.status}>{complaintStatuses[complaint.status]}</option>
                        {nextStatus[complaint.status].map(status => <option value={status} key={status}>{complaintStatuses[status]}</option>)}
                      </select>
                    )}
                  </div>
                </div>

                <p className="text-gray-700 mb-4">{complaint.description}</p>

                {complaint.adminResponse ? (
                  <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                    <p className="text-sm font-semibold text-blue-900 mb-1">
                      Your Response:
                    </p>
                    <p className="text-sm text-blue-800">{complaint.adminResponse}</p>
                  </div>
                ) : complaint.status !== 'CLOSED' ? (
                  <div>
                    {selectedComplaint?.id === complaint.id ? (
                      <div className="space-y-3">
                        <textarea
                          value={response} maxLength={4000} aria-label="Complaint response"
                          onChange={(e) => setResponse(e.target.value)}
                          placeholder="Enter your response..."
                          rows={3}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                        ></textarea>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleResponseSubmit(complaint)}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                          >
                            Send Response
                          </button>
                          <button
                            onClick={() => {
                              setSelectedComplaint(null);
                              setResponse('');
                            }}
                            className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setSelectedComplaint(complaint);
                          setResponse('');
                        }}
                        className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm font-semibold"
                      >
                        Add Response
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600">No complaints found</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminComplaints;
