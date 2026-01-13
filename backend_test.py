import requests
import sys
import json
from datetime import datetime

class CLBHAPITester:
    def __init__(self, base_url="https://risk-detector-4.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.assessment_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        if headers is None:
            headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=30)

            print(f"   Status: {response.status_code}")
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)[:200]}...")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Error: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_root_endpoint(self):
        """Test root API endpoint"""
        return self.run_test("Root Endpoint", "GET", "", 200)

    def test_get_all_questions(self):
        """Test getting all questions"""
        return self.run_test("Get All Questions", "GET", "questions", 200)

    def test_get_module_questions(self):
        """Test getting questions for specific modules"""
        modules = ["lease", "acquisition", "ownership"]
        all_passed = True
        
        for module in modules:
            success, _ = self.run_test(f"Get {module} Questions", "GET", f"questions/{module}", 200)
            if not success:
                all_passed = False
        
        return all_passed

    def test_create_assessment(self):
        """Test creating a new assessment"""
        data = {
            "modules": ["lease", "acquisition"]
        }
        success, response = self.run_test("Create Assessment", "POST", "assessments", 200, data)
        if success and 'id' in response:
            self.assessment_id = response['id']
            print(f"   Assessment ID: {self.assessment_id}")
        return success

    def test_get_assessment(self):
        """Test getting assessment details"""
        if not self.assessment_id:
            print("❌ No assessment ID available for testing")
            return False
        
        return self.run_test("Get Assessment", "GET", f"assessments/{self.assessment_id}", 200)

    def test_save_progress(self):
        """Test saving partial assessment progress"""
        if not self.assessment_id:
            print("❌ No assessment ID available for testing")
            return False

        # Sample partial answers
        sample_answers = [
            {
                "question_id": "lease_1",
                "answer_value": "yes_not_reviewed",
                "points": 5,
                "trigger_flag": False
            },
            {
                "question_id": "lease_2",
                "answer_value": "unlimited",
                "points": 15,
                "trigger_flag": True
            }
        ]

        data = {
            "answers": sample_answers,
            "current_question_index": 2,
            "show_upload": False,
            "uploaded_files": []
        }

        return self.run_test(
            "Save Assessment Progress",
            "POST",
            f"assessments/{self.assessment_id}/save-progress",
            200,
            data
        )

    def test_submit_assessment(self):
        """Test submitting assessment answers"""
        if not self.assessment_id:
            print("❌ No assessment ID available for testing")
            return False

        # Sample answers for lease and acquisition modules
        sample_answers = [
            {
                "question_id": "lease_1",
                "answer_value": "yes_not_reviewed",
                "points": 5,
                "trigger_flag": False
            },
            {
                "question_id": "lease_2",
                "answer_value": "unlimited",
                "points": 15,
                "trigger_flag": True
            },
            {
                "question_id": "acq_1",
                "answer_value": "minimal",
                "points": 15,
                "trigger_flag": True
            }
        ]

        data = {
            "assessment_id": self.assessment_id,
            "answers": sample_answers
        }

        return self.run_test("Submit Assessment", "POST", "assessments/submit", 200, data)

    def test_create_lead(self):
        """Test creating a lead"""
        data = {
            "name": "John Test",
            "email": "john.test@example.com",
            "phone": "(555) 123-4567",
            "business_name": "Test Business LLC",
            "state": "California",
            "modules": ["lease", "acquisition"],
            "situation": "General business health check",
            "assessment_id": self.assessment_id
        }
        
        return self.run_test("Create Lead", "POST", "leads", 200, data)

    def test_get_admin_leads(self):
        """Test getting admin leads"""
        return self.run_test("Get Admin Leads", "GET", "admin/leads", 200)

    def test_export_leads(self):
        """Test exporting leads as CSV"""
        success, _ = self.run_test("Export Leads", "GET", "admin/leads/export", 200)
        return success

def main():
    print("🚀 Starting CLBH API Testing...")
    print("=" * 50)
    
    tester = CLBHAPITester()
    
    # Test sequence
    tests = [
        ("Root Endpoint", tester.test_root_endpoint),
        ("Get All Questions", tester.test_get_all_questions),
        ("Get Module Questions", tester.test_get_module_questions),
        ("Create Assessment", tester.test_create_assessment),
        ("Get Assessment", tester.test_get_assessment),
        ("Save Progress (Session Recovery)", tester.test_save_progress),
        ("Submit Assessment", tester.test_submit_assessment),
        ("Create Lead", tester.test_create_lead),
        ("Get Admin Leads", tester.test_get_admin_leads),
        ("Export Leads", tester.test_export_leads)
    ]
    
    for test_name, test_func in tests:
        print(f"\n{'='*20} {test_name} {'='*20}")
        try:
            test_func()
        except Exception as e:
            print(f"❌ Test {test_name} failed with exception: {str(e)}")
    
    # Print final results
    print(f"\n{'='*50}")
    print(f"📊 Final Results:")
    print(f"   Tests Run: {tester.tests_run}")
    print(f"   Tests Passed: {tester.tests_passed}")
    print(f"   Success Rate: {(tester.tests_passed/tester.tests_run*100):.1f}%" if tester.tests_run > 0 else "0%")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        print(f"⚠️  {tester.tests_run - tester.tests_passed} test(s) failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())