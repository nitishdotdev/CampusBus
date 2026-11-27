import React, { useState, useEffect } from 'react';
import { MessageSquare, Send, AlertCircle, Loader } from 'lucide-react';
import {
  complaintCategories, complaintError, complaintPriorities, complaintStatuses, complaintsV1,
  type Complaint, type ComplaintInput,
} from '../../services/v1/complaints';

const emptyComplaint: ComplaintInput = { title: '', description: '', category: 'OTHER', priority: 'NORMAL' };

export function StudentComplaints() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState(emptyComplaint);
  const [notice, setNotice] = useState('');
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

  const handleChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setFormData(previous => ({ ...previous, [name]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setNotice('');
    if (!formData.title.trim() || !formData.description.trim()) {
      setError('Enter a title and description.');
      return;
    }
    setSubmitting(true);
    try {
      const created = await complaintsV1.submit(formData);
      setComplaints(previous => [created, ...previous]);
      setFormData(emptyComplaint);
      setNotice('Your feedback was submitted.');
    } catch (error) {
      setError(complaintError(error, 'Failed to submit complaint. Your draft is still here.'));
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'bg-yellow-100 text-yellow-800';
      case 'IN_PROGRESS':
        return 'bg-blue-100 text-blue-800';
      case 'RESOLVED':
        return 'bg-green-100 text-green-800';
      case 'CLOSED':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <MessageSquare className="w-8 h-8 text-purple-600" />
            <h1 className="text-3xl font-bold text-gray-800">Feedback & Complaints</h1>
          </div>
          <p className="text-gray-600">Share your experience and help us improve</p>
        </div>

        {/* Submit Form */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Submit Your Feedback</h2>

          {notice && <p role="status" className="mb-4 text-sm text-green-800">{notice}</p>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="complaint-title" className="block text-sm font-semibold text-gray-700 mb-2">
                Title *
              </label>
              <input
                type="text"
                id="complaint-title" name="title" required maxLength={160}
                value={formData.title}
                onChange={handleChange}
                placeholder="Brief summary of your feedback"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                disabled={submitting}
              />
            </div>

            <div>
              <label htmlFor="complaint-description" className="block text-sm font-semibold text-gray-700 mb-2">
                Description *
              </label>
              <textarea
                id="complaint-description" name="description" required maxLength={4000}
                value={formData.description}
                onChange={handleChange}
                placeholder="Please provide details about your experience"
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                disabled={submitting}
              ></textarea>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="complaint-category" className="block text-sm font-semibold text-gray-700 mb-2">
                  Category
                </label>
                <select
                  id="complaint-category" name="category"
                  value={formData.category}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  disabled={submitting}
                >
                  {(Object.keys(complaintCategories) as ComplaintInput['category'][]).map((cat) => (
                    <option key={cat} value={cat}>
                      {complaintCategories[cat]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="complaint-priority" className="block text-sm font-semibold text-gray-700 mb-2">
                  Priority
                </label>
                <select
                  id="complaint-priority" name="priority"
                  value={formData.priority}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  disabled={submitting}
                >
                  <option value="LOW">Low</option>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">High</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              {submitting ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  Submit Feedback
                </>
              )}
            </button>
          </form>
        </div>

        {/* History Section */}
        <div>
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Your Feedback History</h2>

          {loading && (
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
              <Loader className="w-12 h-12 text-purple-400 mx-auto animate-spin mb-3" />
              <p className="text-gray-600">Loading your complaints...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg flex items-center gap-2 mb-6">
              <AlertCircle className="w-5 h-5" />
              {error}
            <button type="button" onClick={() => setReload(n => n + 1)} className="ml-auto underline">Retry history</button>
            </div>
          )}

          {!loading && complaints.length > 0 && (
            <div className="space-y-4">
              {complaints.map((complaint) => (
                <div
                  key={complaint.id}
                  className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800">
                        {complaint.title}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {new Date(complaint.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-semibold whitespace-nowrap ${getStatusColor(
                        complaint.status
                      )}`}
                    >
                      {complaintStatuses[complaint.status]}
                    </span>
                  </div>

                  <p className="text-gray-700 mb-3">{complaint.description}</p>

                  {complaint.adminResponse && (
                    <div className="bg-blue-50 border-l-4 border-blue-500 p-3 rounded">
                      <p className="text-sm font-semibold text-blue-900 mb-1">
                        Admin Response:
                      </p>
                      <p className="text-sm text-blue-800">{complaint.adminResponse}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && !error && complaints.length === 0 && (
            <div className="bg-white rounded-lg shadow-md p-8 text-center">
              <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">No feedback submitted yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default StudentComplaints;
