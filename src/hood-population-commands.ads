--  The command API of item 5 (1.2.91 api.ts issueOrder, previewOrder,
--  cancelOrder, setPay, sackPerson, promote, demote, moveToTeam,
--  moveToPool), written fresh. Every refusal is a numbered reply whose text
--  the page writes (DESIGN 2.2); the checks run in 1.2.91's order.
with Hood.Population.Orders;

package Hood.Population.Commands with Preelaborate is

   type Reply_Kind is
     (Y_None,
      --  accepted
      Y_Accepted,          --  A lieutenant
      Y_Cancelled,
      Y_Back_On_Street,    --  A person
      Y_Promoted,          --  A person
      Y_Broken_Up,
      Y_Joined,            --  A person, B crew slot
      Y_Already_In,        --  A person, B crew slot
      Y_Bought,            --  A vehicle kind (item 6)
      Y_Done,              --  no text
      --  refused
      Y_No_Crew,
      Y_Lt_Unavailable,
      Y_Positive_Whole,
      Y_Only_People,       --  A lieutenant, B people
      Y_At_Most,           --  A order kind, B people
      Y_Staffing,          --  A line kind, B .. D its numbers
      Y_Valid_Amount,
      Y_Donation_Zero,
      Y_Streets,
      Y_Rate,
      Y_No_Block,
      Y_No_Site,
      Y_Valid_Site,
      Y_Site_Not_Valid,
      Y_Inside_City,
      Y_Nothing_There,
      Y_Cannot_Afford,     --  A cost, B left
      Y_No_Time_Trim,      --  A lieutenant, B total, C kept
      Y_No_Time,           --  A lieutenant
      Y_Too_Many_Orders,   --  proposed: a crew holds 24 orders, the city 512
      Y_No_Order,
      Y_No_Person,
      Y_Choose_Hood,
      Y_Not_In_Pool,
      Y_Max_Lieutenants,   --  A the most (12)
      Y_Could_Not_Promote,
      Y_Choose_Hood_Crew,
      Y_Crew_Full,
      Y_Choose_Crew_Hood,
      Y_Cannot_Afford_It); --  item 6: a car

   subtype Accepted_Reply is Reply_Kind range Y_Accepted .. Y_Done;

   type Reply is record
      Kind       : Reply_Kind;
      A, B, C, D : Integer_32;
   end record;

   function Ok (R : Reply) return Boolean is (R.Kind in Accepted_Reply);

   procedure Issue
     (S     : in out Population_State;
      C     : Hood.City.City_State;
      G     : Gang_Id;
      Input : Orders.Order_Input;
      R     : out Reply;
      Kept  : out Target_List;
      Kept_Count : out Integer_32;
      Slot  : out Integer_32);
   --  issueOrder. Kept: the sites the lieutenant could manage (Y_No_Time_Trim).
   --  Slot: the new order's slot when accepted.

   procedure Cancel (S : in out Population_State; C : Hood.City.City_State; G : Gang_Id;
                     Order : Integer_32; R : out Reply);
   procedure Set_Pay (S : in out Population_State; G : Gang_Id; Person, Pay : Integer_32; R : out Reply);
   procedure Sack (S : in out Population_State; G : Gang_Id; Person : Integer_32; R : out Reply);
   procedure Promote (S : in out Population_State; C : Hood.City.City_State; G : Gang_Id;
                      Person : Integer_32; R : out Reply);
   procedure Demote (S : in out Population_State; G : Gang_Id; Crew : Integer_32; R : out Reply);
   procedure Move_To_Crew (S : in out Population_State; C : Hood.City.City_State; G : Gang_Id;
                           Person, Crew : Integer_32; R : out Reply);
   procedure Move_To_Pool (S : in out Population_State; C : Hood.City.City_State; G : Gang_Id;
                           Person : Integer_32; R : out Reply);

   procedure Buy_Vehicle
     (S : in out Population_State; C : Hood.City.City_State; G : Gang_Id;
      Kind : Vehicle_Kind; Crew : Integer_32; R : out Reply);
   --  api.ts buyVehicle: paid from the safe; for the crew (Crew a slot)
   --  or the gang (Crew = No_Id). Its orders are timed again.

end Hood.Population.Commands;
